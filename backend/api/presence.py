"""Authenticated presence heartbeat for mobile/web UrTruck clients."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.verification_gate import get_user
from services import presence_service

presence_router = APIRouter()


class PresenceHeartbeatIn(BaseModel):
    platform: str = Field(default="unknown", max_length=24)
    app_version: str = Field(default="", max_length=48)
    screen: str = Field(default="", max_length=80)
    locale: str = Field(default="", max_length=12)


@presence_router.post("/heartbeat")
def heartbeat(body: PresenceHeartbeatIn, user=Depends(get_user)):
    return presence_service.heartbeat(
        user,
        platform=body.platform,
        app_version=body.app_version,
        screen=body.screen,
        locale=body.locale,
    )
