# pyright: reportMissingTypeStubs=false

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.admin.api import router as admin_router
from app.api.health import router as health_router
from app.auth.api import router as auth_router
from app.auth.bootstrap import ensure_bootstrap_admin
from app.config import Settings, get_settings
from app.db.session import Database
from app.logging import configure_logging
from app.matches.api import router as matches_router
from app.players.api import router as players_router
from app.ratings.api import router as ratings_router
from app.realtime.server import create_socketio_server
from app.rooms.api import router as rooms_router


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        database = Database(app_settings)
        app.state.database = database
        try:
            async with database.session_factory() as session:
                await ensure_bootstrap_admin(
                    session,
                    login_name=app_settings.bootstrap_admin_login,
                    password=app_settings.bootstrap_admin_password,
                )
            yield
        finally:
            await database.close()

    app = FastAPI(
        title="DokerFace API",
        version=__version__,
        lifespan=lifespan,
    )
    app.state.settings = app_settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router, prefix="/api/v1")
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(players_router)
    app.include_router(matches_router)
    app.include_router(ratings_router)
    app.include_router(rooms_router)
    app.state.socketio = create_socketio_server(app, app_settings)
    return app


http_app = create_app()
app = socketio.ASGIApp(http_app.state.socketio, other_asgi_app=http_app)
