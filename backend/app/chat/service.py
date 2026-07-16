"""Transactional chat message persistence."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import ChatMessageRecord


class ChatService:
    async def create_message(
        self,
        session: AsyncSession,
        *,
        room_id: UUID,
        account_id: int,
        message_type: str,
        content: str,
        target_account_id: int | None = None,
    ) -> ChatMessageRecord:
        message = ChatMessageRecord(
            message_id=uuid4(),
            room_id=room_id,
            account_id=account_id,
            message_type=message_type,
            content=content,
            target_account_id=target_account_id,
            created_at=datetime.now(UTC),
        )
        session.add(message)
        await session.commit()
        return message


__all__ = ["ChatService"]
