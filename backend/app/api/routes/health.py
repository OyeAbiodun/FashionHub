from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import database_is_reachable, get_db_session

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health(session: Annotated[AsyncSession, Depends(get_db_session)]) -> dict[str, str]:
    await database_is_reachable(session)
    return {"status": "ok", "database": "reachable"}
