"""AI Report Builder router — conversation-based report generation with Claude."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from schemas.ai_reports import (
    AIBuilderStatusResponse,
    ConversationMessageRequest,
    ConversationReply,
    ConversationStartRequest,
    ReportSpec,
)
from schemas.common import CurrentUser
from services.ai_report_service import (
    continue_conversation,
    delete_conversation,
    get_api_key,
    get_conversation,
    process_conversation,
    start_conversation,
)

router = APIRouter(prefix="/api/reports/ai-builder", tags=["AI Report Builder"])


@router.get("/status", response_model=AIBuilderStatusResponse)
def ai_builder_status(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Check if the AI Report Builder is available (API key configured)."""
    api_key = get_api_key(db)
    if api_key:
        return AIBuilderStatusResponse(available=True)
    return AIBuilderStatusResponse(
        available=False,
        message="No API key configured. Set it in Administration > Planning Parameters > Integrations.",
    )


@router.post("/conversations", response_model=ConversationReply)
def create_conversation(
    body: ConversationStartRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Start a new AI report builder conversation."""
    api_key = get_api_key(db)
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI Report Builder is not available. Configure an Anthropic API key in Administration > Planning Parameters.",
        )

    conv = start_conversation(db, user, body.initial_message)

    try:
        reply_text, report_spec = process_conversation(db, conv, api_key)
    except Exception as e:
        delete_conversation(conv.conversation_id)
        error_msg = str(e)
        if "401" in error_msg or "authentication" in error_msg.lower():
            raise HTTPException(
                status_code=401,
                detail="Invalid API key. Please check your key in Administration > Planning Parameters.",
            )
        raise HTTPException(status_code=500, detail=f"AI service error: {error_msg}")

    return ConversationReply(
        conversation_id=conv.conversation_id,
        text=_clean_reply_text(reply_text),
        report=ReportSpec(**report_spec) if report_spec else None,
    )


@router.post("/conversations/{conversation_id}/messages", response_model=ConversationReply)
def send_message(
    conversation_id: str,
    body: ConversationMessageRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Continue an existing conversation with a new message."""
    api_key = get_api_key(db)
    if not api_key:
        raise HTTPException(status_code=503, detail="AI Report Builder is not available.")

    conv = get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found or expired.")

    if conv.user.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="This conversation belongs to another user.")

    try:
        reply_text, report_spec = continue_conversation(db, conv, body.message, api_key)
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "authentication" in error_msg.lower():
            raise HTTPException(
                status_code=401,
                detail="Invalid API key. Please check your key in Administration > Planning Parameters.",
            )
        raise HTTPException(status_code=500, detail=f"AI service error: {error_msg}")

    return ConversationReply(
        conversation_id=conversation_id,
        text=_clean_reply_text(reply_text),
        report=ReportSpec(**report_spec) if report_spec else None,
    )


@router.delete("/conversations/{conversation_id}")
def remove_conversation(
    conversation_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Delete a conversation and free resources."""
    conv = get_conversation(conversation_id)
    if conv and conv.user.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="This conversation belongs to another user.")
    delete_conversation(conversation_id)
    return {"status": "ok"}


def _clean_reply_text(text: str) -> str:
    """Remove the report_spec JSON block from the reply text shown to the user."""
    import re

    cleaned = re.sub(r"```report_spec\s*\n.*?\n```", "", text, flags=re.DOTALL)
    return cleaned.strip()
