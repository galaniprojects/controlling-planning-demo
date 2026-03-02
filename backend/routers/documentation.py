"""Documentation endpoints (Section 10.7) — 4 endpoints serving module manuals and FAQs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from dependencies import get_current_user
from schemas.common import CurrentUser
from schemas.documentation import (
    FAQDetail,
    FAQStep,
    FAQSummary,
    ModuleManualDetail,
    ModuleManualSection,
    ModuleManualSummary,
)

router = APIRouter(prefix="/api/docs", tags=["Documentation"])


@router.get("/modules")
def get_module_list(
    request: Request,
    _user: CurrentUser = Depends(get_current_user),
):
    """Get list of all module manuals."""
    manuals = request.app.state.fixtures.get("manuals", [])
    items = []
    for m in manuals:
        first_section = m.get("sections", [{}])[0] if m.get("sections") else {}
        items.append(
            ModuleManualSummary(
                module_id=m["module_id"],
                module_name=m["module_name"],
                description=first_section.get("body", "")[:200],
            )
        )
    return {"items": items, "total": len(items)}


@router.get("/modules/{module_id}")
def get_module_manual(
    module_id: str,
    request: Request,
    _user: CurrentUser = Depends(get_current_user),
):
    """Get a module manual with all sections."""
    manuals = request.app.state.fixtures.get("manuals", [])
    for m in manuals:
        if m["module_id"] == module_id:
            return ModuleManualDetail(
                module_id=m["module_id"],
                module_name=m["module_name"],
                sections=[
                    ModuleManualSection(title=s["title"], body=s["body"])
                    for s in m.get("sections", [])
                ],
            )
    raise HTTPException(status_code=404, detail=f"Manual not found: {module_id}")


@router.get("/faq")
def get_faq_list(
    request: Request,
    _user: CurrentUser = Depends(get_current_user),
):
    """Get list of all FAQ entries."""
    faqs = request.app.state.fixtures.get("faq", [])
    items = [
        FAQSummary(
            id=f["id"],
            question=f["question"],
            summary=f["summary"],
            applicable_roles=f.get("applicable_roles", []),
            modules_involved=f.get("modules_involved", []),
        )
        for f in faqs
    ]
    return {"items": items, "total": len(items)}


@router.get("/faq/{faq_id}")
def get_faq_detail(
    faq_id: str,
    request: Request,
    _user: CurrentUser = Depends(get_current_user),
):
    """Get a single FAQ entry with steps."""
    faqs = request.app.state.fixtures.get("faq", [])
    for f in faqs:
        if f["id"] == faq_id:
            return FAQDetail(
                id=f["id"],
                question=f["question"],
                summary=f["summary"],
                applicable_roles=f.get("applicable_roles", []),
                modules_involved=f.get("modules_involved", []),
                steps=[
                    FAQStep(
                        step_number=s["step_number"],
                        instruction=s["instruction"],
                        target_module=s.get("target_module"),
                    )
                    for s in f.get("steps", [])
                ],
            )
    raise HTTPException(status_code=404, detail=f"FAQ not found: {faq_id}")
