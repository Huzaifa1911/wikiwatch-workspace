from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.database import get_db
from app.core.exceptions import AppError
from app.models import Edit
from app.schemas.base import SuccessResponse
from app.schemas.contracts import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=SuccessResponse[HealthResponse],
    summary="Check API and database readiness",
)
async def health(db=Depends(get_db)):
    try:
        await db.execute(select(func.count()).select_from(Edit))
    except Exception:
        raise AppError(503, "Database unavailable or migrations not applied") from None
    return {"data": HealthResponse()}
