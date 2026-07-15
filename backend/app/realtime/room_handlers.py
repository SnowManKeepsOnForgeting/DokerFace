# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnusedFunction=false

"""Socket.IO handlers for waiting-room membership."""

from typing import Any, cast

from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy import select

from app.auth.passwords import PasswordService
from app.config import Settings
from app.db.session import Database
from app.realtime.schemas import (
    RoomJoinEvent,
    RoomLeaveEvent,
    RoomMemberSnapshot,
    RoomReadyEvent,
    RoomSnapshot,
)
from app.rooms.config import RoomRules, RoomVisibility
from app.rooms.models import Room, RoomStatus
from app.rooms.registry import RoomRegistry, RoomRuntime, RoomRuntimeError


def register_room_handlers(
    server: Any,
    app: FastAPI,
    settings: Settings,
    registry: RoomRegistry,
) -> None:
    @server.on("room:join")
    async def room_join(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(RoomJoinEvent, data)
        if event is None:
            return _error("invalid_payload")
        account_id = await _account_id_for_sid(server, sid)
        if account_id is None:
            return _error("authentication_required")

        room = await _load_room(app, event.room_id)
        if room is None or room.status is RoomStatus.CLOSED:
            return _error("room_not_found")
        if room.visibility is RoomVisibility.INVITE:
            return _error("invitation_required")
        if room.visibility is RoomVisibility.PASSWORD:
            if room.password_hash is None or event.password is None:
                return _error("password_required")
            if not PasswordService().verify(event.password, room.password_hash):
                return _error("invalid_password")

        try:
            rules = RoomRules.model_validate(room.rules)
        except ValidationError:
            return _error("invalid_room_rules")
        runtime = registry.ensure_room(
            event.room_id,
            host_account_id=room.host_account_id,
            max_players=rules.max_players,
        )
        try:
            registry.join(event.room_id, account_id=account_id, sid=sid)
        except RoomRuntimeError as error:
            return _error(_runtime_error_code(error))

        await server.enter_room(sid, str(event.room_id))
        return await _broadcast_snapshot(server, runtime)

    @server.on("room:ready")
    async def room_ready(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(RoomReadyEvent, data)
        if event is None:
            return _error("invalid_payload")
        account_id = await _account_id_for_sid(server, sid)
        if account_id is None:
            return _error("authentication_required")
        runtime = registry.get(event.room_id)
        if runtime is None:
            return _error("room_not_joined")
        try:
            registry.set_ready(event.room_id, account_id, event.ready)
        except RoomRuntimeError as error:
            return _error(_runtime_error_code(error))
        return await _broadcast_snapshot(server, runtime)

    @server.on("room:leave")
    async def room_leave(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(RoomLeaveEvent, data)
        if event is None:
            return _error("invalid_payload")
        account_id = await _account_id_for_sid(server, sid)
        if account_id is None:
            return _error("authentication_required")
        runtime = registry.get(event.room_id)
        if runtime is None:
            return _error("room_not_joined")
        try:
            registry.leave(event.room_id, account_id)
        except RoomRuntimeError as error:
            return _error(_runtime_error_code(error))
        await server.leave_room(sid, str(event.room_id))
        return await _broadcast_snapshot(server, runtime)


async def _account_id_for_sid(server: Any, sid: str) -> int | None:
    session = await server.get_session(sid)
    session_data = cast(dict[str, object], session) if isinstance(session, dict) else {}
    account_id = session_data.get("account_id")
    return account_id if isinstance(account_id, int) else None


async def _load_room(app: FastAPI, room_id: Any) -> Room | None:
    database = cast(Database, app.state.database)
    async with database.session_factory() as db_session:
        return await db_session.scalar(select(Room).where(Room.room_id == room_id))


def _parse_event(model_type: Any, data: Any) -> Any | None:
    try:
        return model_type.model_validate(data)
    except ValidationError:
        return None


async def _broadcast_snapshot(server: Any, runtime: RoomRuntime) -> dict[str, Any]:
    snapshot = RoomSnapshot(
        room_id=runtime.room_id,
        host_account_id=runtime.host_account_id,
        members=[
            RoomMemberSnapshot(account_id=member.account_id, ready=member.ready)
            for member in sorted(runtime.members.values(), key=lambda member: member.account_id)
        ],
    )
    payload = snapshot.model_dump(mode="json")
    await server.emit("room:snapshot", payload, room=str(runtime.room_id))
    return {"ok": True, "room": payload}


def _runtime_error_code(error: RoomRuntimeError) -> str:
    message = str(error)
    if "available player slot" in message:
        return "room_full"
    if "another room" in message:
        return "already_in_room"
    if "Host-leave" in message:
        return "host_leave_policy_required"
    if "not a member" in message:
        return "not_a_member"
    return "room_not_joined"


def _error(code: str) -> dict[str, Any]:
    return {"ok": False, "error": code}


__all__ = ["register_room_handlers"]
