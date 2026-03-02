"""Administration router — demo reset endpoint."""

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/admin", tags=["Administration"])


@router.post("/reset-demo")
def reset_demo(request: Request):
    """Drop all tables, recreate schema, and reload seed data.

    This is a demo-only endpoint for resetting the application to its
    initial state. Not intended for production use.
    """
    from seed.loader import reset_database

    fixtures = reset_database()
    request.app.state.fixtures = fixtures

    return {
        "status": "ok",
        "message": "Demo data has been reset to initial state.",
        "loaded": {
            "manuals": len(fixtures.get("manuals", [])),
            "faq": len(fixtures.get("faq", [])),
            "advisor_goals": len(fixtures.get("advisor_goals", [])),
        },
    }
