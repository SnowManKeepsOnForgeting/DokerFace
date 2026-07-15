from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.health import get_db_session
from app.config import Settings
from app.main import create_app


async def test_liveness_reports_version() -> None:
    settings = Settings(database_url="sqlite+aiosqlite:///:memory:")
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.1.0"}


async def test_readiness_checks_database() -> None:
    settings = Settings(database_url="sqlite+aiosqlite:///:memory:")
    app = create_app(settings)
    transport = ASGITransport(app=app)
    session = AsyncMock(spec=AsyncSession)

    async def override_db_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_db_session] = override_db_session

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    session.execute.assert_awaited_once()
