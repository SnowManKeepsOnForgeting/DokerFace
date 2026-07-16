"""Transactional rating batch and account initialization operations."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountStatus
from app.ratings.models import RatingBatch, RatingRecord

INITIAL_RATING = 1000


class RatingService:
    async def current_batch(self, session: AsyncSession) -> RatingBatch | None:
        return await session.scalar(
            select(RatingBatch)
            .order_by(RatingBatch.created_at.desc(), RatingBatch.batch_id.desc())
            .limit(1)
        )

    async def ensure_current_batch(
        self,
        session: AsyncSession,
        created_by_account_id: int | None = None,
    ) -> RatingBatch:
        batch = await self.current_batch(session)
        if batch is not None:
            return batch
        batch = RatingBatch(
            batch_id=uuid.uuid4(),
            created_by_account_id=created_by_account_id,
            created_at=datetime.now(UTC),
        )
        session.add(batch)
        return batch

    async def initialize_account(self, session: AsyncSession, account_id: int) -> RatingRecord:
        batch = await self.ensure_current_batch(session)
        rating = await session.scalar(
            select(RatingRecord).where(
                RatingRecord.batch_id == batch.batch_id,
                RatingRecord.account_id == account_id,
            )
        )
        if rating is not None:
            return rating
        rating = RatingRecord(
            batch_id=batch.batch_id,
            account_id=account_id,
            rating=INITIAL_RATING,
            highest_rating=INITIAL_RATING,
            completed_matches=0,
        )
        session.add(rating)
        return rating

    async def reset_batch(
        self,
        session: AsyncSession,
        administrator_account_id: int,
    ) -> RatingBatch:
        batch = RatingBatch(
            batch_id=uuid.uuid4(),
            created_by_account_id=administrator_account_id,
            created_at=datetime.now(UTC),
        )
        session.add(batch)
        accounts = list(
            (
                await session.scalars(
                    select(Account).where(Account.status != AccountStatus.DELETED)
                )
            ).all()
        )
        session.add_all(
            [
                RatingRecord(
                    batch_id=batch.batch_id,
                    account_id=account.account_id,
                    rating=INITIAL_RATING,
                    highest_rating=INITIAL_RATING,
                    completed_matches=0,
                )
                for account in accounts
            ]
        )
        return batch

    async def leaderboard_entries(
        self,
        session: AsyncSession,
        offset: int,
        limit: int,
    ) -> tuple[RatingBatch | None, Sequence[RatingRecord]]:
        batch = await self.current_batch(session)
        if batch is None:
            return None, ()
        entries = list(
            (
                await session.scalars(
                    select(RatingRecord)
                    .where(RatingRecord.batch_id == batch.batch_id)
                    .order_by(
                        RatingRecord.rating.desc(),
                        RatingRecord.highest_rating.desc(),
                        RatingRecord.completed_matches.desc(),
                        RatingRecord.account_id,
                    )
                    .offset(offset)
                    .limit(limit)
                )
            ).all()
        )
        return batch, entries


__all__ = ["INITIAL_RATING", "RatingService"]
