# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnusedFunction=false

"""Socket.IO server wiring for authenticated connections."""

from typing import Any, cast

import socketio
from fastapi import FastAPI

from app.auth.sessions import SessionService
from app.config import Settings
from app.db.session import Database
from app.realtime.auth import extract_session_token, is_allowed_origin
from app.realtime.connections import ConnectionRegistry
from app.realtime.room_handlers import register_room_handlers
from app.rooms.registry import RoomRegistry


def create_socketio_server(app: FastAPI, settings: Settings) -> socketio.AsyncServer:
    server = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins=settings.cors_origins,
    )
    registry = ConnectionRegistry()
    room_registry = RoomRegistry()
    app.state.connection_registry = registry
    app.state.room_registry = room_registry
    register_room_handlers(server, app, settings, room_registry)

    @server.event
    async def connect(
        sid: str,
        environ: dict[str, Any],
        auth: dict[str, Any] | None = None,
    ) -> bool:
        del auth
        if not is_allowed_origin(environ, settings.cors_origins):
            return False
        token = extract_session_token(environ, settings.session_cookie_name)
        if token is None:
            return False

        database = cast(Database, app.state.database)
        async with database.session_factory() as db_session:
            account = await SessionService(settings.session_ttl_hours).authenticate(
                db_session,
                token,
            )
        if account is None:
            return False

        await server.save_session(sid, {"account_id": account.account_id})
        previous_sid = registry.replace(account.account_id, sid)
        if previous_sid is not None:
            await server.disconnect(previous_sid)
        return True

    @server.event
    async def disconnect(sid: str) -> None:
        registry.release(sid)

    return server


__all__ = ["create_socketio_server"]
