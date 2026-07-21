from datetime import datetime
from typing import Annotated, Never
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models import Account, AccountRole, AccountStatus
from app.admin.accounts import (
    AccountAdminService,
    AccountAlreadyExistsError,
    AccountManagementError,
    AccountNotFoundError,
    LastAdministratorError,
)
from app.admin.models import AdminAuditLog
from app.auth.api import CurrentUserResponse, to_current_user
from app.auth.dependencies import require_administrator
from app.chat.models import ChatMessageRecord
from app.db.dependencies import get_db_session
from app.matches.api import MatchSummaryResponse, to_match_summary
from app.matches.models import MatchRecord
from app.matches.persistence import MatchHistoryPersistenceService
from app.ratings.service import RatingService
from app.rooms.api import RoomResponse, to_room_response
from app.rooms.models import Room, RoomStatus
from app.rooms.registry import RoomMember


class AdminAccountResponse(BaseModel):
    account_id: int
    login_name: str
    role: AccountRole
    status: AccountStatus
    display_name: str
    avatar_text: str | None = None
    avatar_background_color: str | None = None
    rank_badge_theme: str | None = None
    created_at: datetime
    last_login_at: datetime | None = None


class AdminAccountListResponse(BaseModel):
    items: list[AdminAccountResponse]
    total: int
    offset: int
    limit: int


class AdminRoomListResponse(BaseModel):
    items: list[RoomResponse]
    total: int
    offset: int
    limit: int


class AdminChatResponse(BaseModel):
    message_id: UUID
    room_id: UUID
    account_id: int
    message_type: str
    content: str
    target_account_id: int | None
    created_at: datetime


class AdminChatListResponse(BaseModel):
    items: list[AdminChatResponse]
    total: int
    offset: int
    limit: int


class AuditLogResponse(BaseModel):
    audit_log_id: UUID
    administrator_account_id: int
    action: str
    target_account_id: int | None
    before_state: dict[str, object] | None
    after_state: dict[str, object] | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    offset: int
    limit: int


class AdminMatchListResponse(BaseModel):
    items: list[MatchSummaryResponse]
    total: int
    offset: int
    limit: int


router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class CreateAccountRequest(BaseModel):
    login_name: str
    password: str
    display_name: str | None = None
    role: AccountRole = AccountRole.PLAYER


class UpdateAccountRequest(BaseModel):
    status: AccountStatus | None = None
    role: AccountRole | None = None


class ResetPasswordRequest(BaseModel):
    password: str


class VoidMatchRequest(BaseModel):
    reason: str


class VoidMatchResponse(BaseModel):
    match_id: UUID
    status: str
    void_reason: str


def raise_account_http_error(error: AccountManagementError) -> Never:
    if isinstance(error, AccountAlreadyExistsError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if isinstance(error, AccountNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    if isinstance(error, LastAdministratorError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.post(
    "/accounts",
    response_model=CurrentUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_account(
    payload: CreateAccountRequest,
    administrator: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    try:
        account = await AccountAdminService().create_account(
            db_session,
            administrator,
            login_name=payload.login_name,
            password=payload.password,
            display_name=payload.display_name,
            role=payload.role,
        )
    except AccountManagementError as error:
        raise_account_http_error(error)
    return to_current_user(account)


@router.patch("/accounts/{account_id}", response_model=CurrentUserResponse)
async def update_account(
    account_id: int,
    payload: UpdateAccountRequest,
    administrator: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> CurrentUserResponse:
    if payload.status is None and payload.role is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one account field is required",
        )
    if payload.status is not None and payload.role is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Update status and role separately",
        )

    service = AccountAdminService()
    try:
        if payload.status is AccountStatus.DISABLED:
            account = await service.disable_account(db_session, administrator, account_id)
        elif payload.status is AccountStatus.ACTIVE:
            account = await service.restore_account(db_session, administrator, account_id)
        elif payload.status is AccountStatus.DELETED:
            account = await service.soft_delete_account(db_session, administrator, account_id)
        else:
            assert payload.role is not None
            account = await service.update_role(
                db_session,
                administrator,
                account_id,
                payload.role,
            )
    except AccountManagementError as error:
        raise_account_http_error(error)

    # Disconnect active socket if status disabled/deleted or role updated
    connection_registry = getattr(request.app.state, "connection_registry", None)
    socketio_server = getattr(request.app.state, "socketio", None)
    if connection_registry is not None and socketio_server is not None:
        sid = connection_registry.sid_for_account(account_id)
        if sid is not None:
            await socketio_server.disconnect(sid)

    return to_current_user(account)


@router.post(
    "/accounts/{account_id}/reset-password",
    response_model=CurrentUserResponse,
)
async def reset_password(
    account_id: int,
    payload: ResetPasswordRequest,
    administrator: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> CurrentUserResponse:
    try:
        account = await AccountAdminService().reset_password(
            db_session,
            administrator,
            account_id,
            payload.password,
        )
    except AccountManagementError as error:
        raise_account_http_error(error)

    # Disconnect active socket on password reset
    connection_registry = getattr(request.app.state, "connection_registry", None)
    socketio_server = getattr(request.app.state, "socketio", None)
    if connection_registry is not None and socketio_server is not None:
        sid = connection_registry.sid_for_account(account_id)
        if sid is not None:
            await socketio_server.disconnect(sid)

    return to_current_user(account)


@router.post(
    "/matches/{match_id}/void",
    response_model=VoidMatchResponse,
)
async def void_match(
    match_id: UUID,
    payload: VoidMatchRequest,
    _: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> VoidMatchResponse:
    if not payload.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Void reason is required",
        )
    try:
        async with db_session.begin():
            match = await MatchHistoryPersistenceService().void_match(
                db_session,
                match_id=match_id,
                reason=payload.reason.strip(),
            )
            await RatingService().rebuild_current_batch(db_session)
    except ValueError as error:
        detail = str(error)
        error_status = (
            status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=error_status, detail=detail) from error
    return VoidMatchResponse(
        match_id=match.match_id,
        status=match.status,
        void_reason=match.void_reason or payload.reason.strip(),
    )


@router.get("/accounts", response_model=AdminAccountListResponse)
async def list_accounts(
    _: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    login_name: str | None = None,
    role: AccountRole | None = None,
    status: AccountStatus | None = None,
    offset: int = 0,
    limit: int = 100,
) -> AdminAccountListResponse:
    if offset < 0 or limit <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid pagination parameters",
        )

    query = select(Account).options(selectinload(Account.profile))
    count_query = select(func.count()).select_from(Account)

    if login_name is not None and login_name.strip():
        query = query.where(Account.login_name.ilike(f"%{login_name.strip()}%"))
        count_query = count_query.where(Account.login_name.ilike(f"%{login_name.strip()}%"))

    if role is not None:
        query = query.where(Account.role == role)
        count_query = count_query.where(Account.role == role)

    if status is not None:
        query = query.where(Account.status == status)
        count_query = count_query.where(Account.status == status)
    else:
        query = query.where(Account.status != AccountStatus.DELETED)
        count_query = count_query.where(Account.status != AccountStatus.DELETED)

    total = await db_session.scalar(count_query) or 0
    accounts = list(
        (
            await db_session.scalars(query.order_by(Account.account_id).offset(offset).limit(limit))
        ).all()
    )

    items: list[AdminAccountResponse] = []
    for account in accounts:
        profile = account.profile
        items.append(
            AdminAccountResponse(
                account_id=account.account_id,
                login_name=account.login_name,
                role=account.role,
                status=account.status,
                display_name=profile.display_name if profile else account.login_name,
                avatar_text=profile.avatar_text if profile else None,
                avatar_background_color=profile.avatar_background_color if profile else None,
                rank_badge_theme=profile.rank_badge_theme if profile else None,
                created_at=account.created_at,
                last_login_at=account.last_login_at,
            )
        )

    return AdminAccountListResponse(
        items=items,
        total=int(total),
        offset=offset,
        limit=limit,
    )


@router.get("/rooms", response_model=AdminRoomListResponse)
async def list_admin_rooms(
    _: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
    status: RoomStatus | None = None,
    offset: int = 0,
    limit: int = 50,
) -> AdminRoomListResponse:
    if offset < 0 or limit <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid pagination parameters",
        )

    query = select(Room)
    count_query = select(func.count()).select_from(Room)

    if status is not None:
        query = query.where(Room.status == status)
        count_query = count_query.where(Room.status == status)

    total = await db_session.scalar(count_query) or 0
    rooms = list(
        (
            await db_session.scalars(
                query.order_by(Room.created_at.desc(), Room.room_id).offset(offset).limit(limit)
            )
        ).all()
    )

    room_registry = getattr(request.app.state, "room_registry", None)
    return AdminRoomListResponse(
        items=[to_room_response(room, room_registry) for room in rooms],
        total=int(total),
        offset=offset,
        limit=limit,
    )


@router.post("/rooms/{room_id}/close", status_code=status.HTTP_204_NO_CONTENT)
async def close_room_admin(
    room_id: UUID,
    administrator: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> None:
    room = await db_session.scalar(select(Room).where(Room.room_id == room_id))
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    if room.status == RoomStatus.CLOSED:
        return

    room.status = RoomStatus.CLOSED
    await db_session.flush()

    db_session.add(
        AdminAuditLog(
            administrator_account_id=administrator.account_id,
            action="room_closed",
            before_state={"room_id": str(room_id), "status": room.status.value},
            after_state={"room_id": str(room_id), "status": "closed"},
        )
    )
    await db_session.commit()

    room_registry = getattr(request.app.state, "room_registry", None)
    match_registry = getattr(request.app.state, "match_registry", None)
    socketio_server = getattr(request.app.state, "socketio", None)

    members: tuple[RoomMember, ...] = ()
    if room_registry is not None:
        runtime = room_registry.get(room_id)
        if runtime is not None and match_registry is not None:
            match = match_registry.for_room(room_id)
            if match is not None:
                await match_registry.remove(match)

        members = room_registry.close(room_id)

    if socketio_server is not None:
        await socketio_server.emit(
            "room:kicked",
            {"room_id": str(room_id), "reason": "admin_closed"},
            room=str(room_id),
        )
        for member in members:
            await socketio_server.leave_room(member.sid, str(room_id))

    if socketio_server is not None:
        await socketio_server.emit("lobby:rooms-updated", {"schema_version": 1})


@router.get("/chats", response_model=AdminChatListResponse)
async def list_admin_chats(
    _: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    room_id: UUID | None = None,
    account_id: int | None = None,
    offset: int = 0,
    limit: int = 100,
) -> AdminChatListResponse:
    if offset < 0 or limit <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pagination parameters",
        )

    query = select(ChatMessageRecord)
    count_query = select(func.count()).select_from(ChatMessageRecord)

    if room_id is not None:
        query = query.where(ChatMessageRecord.room_id == room_id)
        count_query = count_query.where(ChatMessageRecord.room_id == room_id)

    if account_id is not None:
        query = query.where(ChatMessageRecord.account_id == account_id)
        count_query = count_query.where(ChatMessageRecord.account_id == account_id)

    total = await db_session.scalar(count_query) or 0
    messages = list(
        (
            await db_session.scalars(
                query.order_by(ChatMessageRecord.created_at.desc(), ChatMessageRecord.message_id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )

    return AdminChatListResponse(
        items=[
            AdminChatResponse(
                message_id=msg.message_id,
                room_id=msg.room_id,
                account_id=msg.account_id,
                message_type=msg.message_type,
                content=msg.content,
                target_account_id=msg.target_account_id,
                created_at=msg.created_at,
            )
            for msg in messages
        ],
        total=int(total),
        offset=offset,
        limit=limit,
    )


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    _: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    offset: int = 0,
    limit: int = 50,
) -> AuditLogListResponse:
    if offset < 0 or limit <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pagination parameters",
        )

    total = await db_session.scalar(select(func.count()).select_from(AdminAuditLog))
    logs = list(
        (
            await db_session.scalars(
                select(AdminAuditLog)
                .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.audit_log_id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )

    return AuditLogListResponse(
        items=[
            AuditLogResponse(
                audit_log_id=log.audit_log_id,
                administrator_account_id=log.administrator_account_id,
                action=log.action,
                target_account_id=log.target_account_id,
                before_state=log.before_state,
                after_state=log.after_state,
                created_at=log.created_at,
            )
            for log in logs
        ],
        total=int(total or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/matches", response_model=AdminMatchListResponse)
async def list_admin_matches(
    _: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    room_id: UUID | None = None,
    status: str | None = None,
    offset: int = 0,
    limit: int = 50,
) -> AdminMatchListResponse:
    if offset < 0 or limit <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid pagination parameters",
        )

    query = select(MatchRecord).options(selectinload(MatchRecord.players))
    count_query = select(func.count()).select_from(MatchRecord)

    if room_id is not None:
        query = query.where(MatchRecord.room_id == room_id)
        count_query = count_query.where(MatchRecord.room_id == room_id)

    if status is not None:
        query = query.where(MatchRecord.status == status)
        count_query = count_query.where(MatchRecord.status == status)

    total = await db_session.scalar(count_query) or 0
    matches = list(
        (
            await db_session.scalars(
                query.order_by(MatchRecord.started_at.desc(), MatchRecord.match_id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )

    return AdminMatchListResponse(
        items=[to_match_summary(match) for match in matches],
        total=int(total),
        offset=offset,
        limit=limit,
    )


__all__ = ["router"]
