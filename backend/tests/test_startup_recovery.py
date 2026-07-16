from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import create_app
from app.matches.persistence import MatchHistoryPersistenceService


@pytest.mark.asyncio
async def test_startup_recovery_service_voids_active_matches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock(spec=AsyncSession)
    recovery = AsyncMock(spec=MatchHistoryPersistenceService)
    recovery.void_active_matches.return_value = 2
    monkeypatch.setattr(
        "app.main.MatchHistoryPersistenceService",
        lambda: recovery,
    )
    monkeypatch.setattr("app.main.ensure_bootstrap_admin", AsyncMock(return_value=False))

    app = create_app()

    class FakeContext:
        async def __aenter__(self) -> AsyncSession:
            return session

        async def __aexit__(self, *args: object) -> None:
            return None

    class FakeDatabase:
        def session_factory(self) -> FakeContext:
            return FakeContext()

        async def close(self) -> None:
            return None

    def make_database(_settings: object) -> FakeDatabase:
        return FakeDatabase()

    monkeypatch.setattr("app.main.Database", make_database)

    async with app.router.lifespan_context(app):
        pass

    recovery.void_active_matches.assert_awaited_once_with(session, reason="server_restart")
