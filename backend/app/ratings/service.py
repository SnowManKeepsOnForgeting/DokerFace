"""Transactional rating batch and account initialization operations."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models import Account, AccountStatus
from app.matches.models import MatchRecord
from app.ratings.calculator import RatingParticipant, calculate_ratings
from app.ratings.models import RatingBatch, RatingChangeRecord, RatingRecord

INITIAL_RATING = 1000
RATING_QUANTUM = Decimal("0.0001")


@dataclass(frozen=True)
class RatingSettlement:
    account_id: int
    finishing_rank: int


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

    async def ensure_account_ratings(self, session: AsyncSession) -> RatingBatch:
        batch = await self.ensure_current_batch(session)
        await session.flush()
        accounts = list(
            (
                await session.scalars(
                    select(Account).where(Account.status != AccountStatus.DELETED)
                )
            ).all()
        )
        existing_account_ids = set(
            (
                await session.scalars(
                    select(RatingRecord.account_id).where(RatingRecord.batch_id == batch.batch_id)
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
                if account.account_id not in existing_account_ids
            ]
        )
        return batch

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

    async def settle_match(
        self,
        session: AsyncSession,
        *,
        match_id: uuid.UUID,
        results: Sequence[RatingSettlement],
    ) -> tuple[RatingChangeRecord, ...]:
        batch = await self.ensure_current_batch(session)
        result_by_account = {result.account_id: result for result in results}
        if len(result_by_account) != len(results) or len(result_by_account) < 2:
            raise ValueError("Rating settlement requires unique results for at least two players")
        ratings = {
            rating.account_id: rating
            for rating in await session.scalars(
                select(RatingRecord)
                .where(
                    RatingRecord.batch_id == batch.batch_id,
                    RatingRecord.account_id.in_(result_by_account),
                )
                .with_for_update()
            )
        }
        for account_id in result_by_account:
            if account_id not in ratings:
                ratings[account_id] = await self.initialize_account(session, account_id)
        participants = tuple(
            RatingParticipant(
                account_id=account_id,
                rating=float(ratings[account_id].rating),
                finishing_rank=result.finishing_rank,
            )
            for account_id, result in result_by_account.items()
        )
        changes = calculate_ratings(participants)
        records: list[RatingChangeRecord] = []
        for change in changes:
            rating = ratings[change.account_id]
            before = _quantize(Decimal(str(change.before_rating)))
            delta = _quantize(Decimal(str(change.delta)))
            after = _quantize(Decimal(str(change.after_rating)))
            rating.rating = after
            rating.highest_rating = max(rating.highest_rating, after)
            rating.completed_matches += 1
            record = RatingChangeRecord(
                batch_id=batch.batch_id,
                match_id=match_id,
                account_id=change.account_id,
                before_rating=before,
                delta=delta,
                after_rating=after,
                finishing_rank=result_by_account[change.account_id].finishing_rank,
            )
            session.add(record)
            records.append(record)
        return tuple(records)

    async def rebuild_current_batch(self, session: AsyncSession) -> None:
        batch = await self.current_batch(session)
        if batch is None:
            return
        await session.execute(
            delete(RatingChangeRecord).where(RatingChangeRecord.batch_id == batch.batch_id)
        )
        ratings = {
            rating.account_id: rating
            for rating in await session.scalars(
                select(RatingRecord)
                .where(RatingRecord.batch_id == batch.batch_id)
                .with_for_update()
            )
        }
        for rating in ratings.values():
            rating.rating = Decimal(INITIAL_RATING)
            rating.highest_rating = Decimal(INITIAL_RATING)
            rating.completed_matches = 0
        matches = list(
            (
                await session.scalars(
                    select(MatchRecord)
                    .options(selectinload(MatchRecord.players))
                    .where(
                        MatchRecord.status == "complete",
                        MatchRecord.started_at >= batch.created_at,
                    )
                    .order_by(MatchRecord.started_at, MatchRecord.match_id)
                )
            ).all()
        )
        for match in matches:
            if any(player.finishing_rank is None for player in match.players):
                continue
            ranks = {player.account_id: player.finishing_rank or 1 for player in match.players}
            participants: list[RatingParticipant] = []
            for player in match.players:
                rating = ratings.get(player.account_id)
                if rating is None:
                    rating = await self.initialize_account(session, player.account_id)
                    ratings[player.account_id] = rating
                participants.append(
                    RatingParticipant(
                        account_id=player.account_id,
                        rating=float(rating.rating),
                        finishing_rank=ranks[player.account_id],
                    )
                )
            for change in calculate_ratings(tuple(participants)):
                rating = ratings[change.account_id]
                before = _quantize(Decimal(str(change.before_rating)))
                delta = _quantize(Decimal(str(change.delta)))
                after = _quantize(Decimal(str(change.after_rating)))
                rating.rating = after
                rating.highest_rating = max(rating.highest_rating, after)
                rating.completed_matches += 1
                session.add(
                    RatingChangeRecord(
                        batch_id=batch.batch_id,
                        match_id=match.match_id,
                        account_id=change.account_id,
                        before_rating=before,
                        delta=delta,
                        after_rating=after,
                        finishing_rank=ranks[change.account_id],
                    )
                )


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(RATING_QUANTUM, rounding=ROUND_HALF_UP)


__all__ = ["INITIAL_RATING", "RatingService", "RatingSettlement"]
