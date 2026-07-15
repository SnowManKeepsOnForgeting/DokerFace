from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

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
    return app


app = create_app()
