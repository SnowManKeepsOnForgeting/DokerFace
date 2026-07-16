# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnusedFunction=false

"""Socket.IO handlers for waiting rooms and in-memory matches."""

from random import Random, SystemRandom
from typing import Any, cast
from uuid import UUID, uuid4

from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy import select

from app.accounts.models import Profile
from app.auth.passwords import PasswordService
from app.config import Settings
from app.db.session import Database
from app.game_engine.actor import (
    MatchActor,
    MatchActorSnapshot,
    MatchCommand,
    MatchCommandConflictError,
)
from app.game_engine.contracts import ActionCommand
from app.game_engine.match import MatchCoordinator
from app.matches.registry import MatchPlayer, MatchRegistry, MatchRuntime, MatchRuntimeError
from app.realtime.schemas import (
    GameActionEvent,
    GameActionRejected,
    GameHandSettled,
    GameLegalAction,
    GameMatchSettled,
    GamePlayerSnapshot,
    GamePrivateSnapshot,
    GamePublicSnapshot,
    GameRequestSnapshotEvent,
    RoomJoinEvent,
    RoomLeaveEvent,
    RoomMemberSnapshot,
    RoomReadyEvent,
    RoomSnapshot,
    RoomStartEvent,
)
from app.rooms.config import RoomRules, RoomVisibility
from app.rooms.models import Room, RoomStatus
from app.rooms.registry import RoomRegistry, RoomRuntime, RoomRuntimeError


def register_room_handlers(
    server: Any,
    app: FastAPI,
    settings: Settings,
    registry: RoomRegistry,
    match_registry: MatchRegistry | None = None,
    random_source: Random | SystemRandom | None = None,
) -> None:
    matches = match_registry or MatchRegistry()
    randomizer = random_source or SystemRandom()

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
        if room.status is not RoomStatus.WAITING:
            return _error("room_not_waiting")
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
        return await _broadcast_room_snapshot(server, runtime, RoomStatus.WAITING)

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
        if matches.for_room(event.room_id) is not None:
            return _error("room_active")
        try:
            registry.set_ready(event.room_id, account_id, event.ready)
        except RoomRuntimeError as error:
            return _error(_runtime_error_code(error))
        return await _broadcast_room_snapshot(server, runtime, RoomStatus.WAITING)

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
        if matches.for_room(event.room_id) is not None:
            return _error("room_active")
        try:
            registry.leave(event.room_id, account_id)
        except RoomRuntimeError as error:
            return _error(_runtime_error_code(error))
        await server.leave_room(sid, str(event.room_id))
        return await _broadcast_room_snapshot(server, runtime, RoomStatus.WAITING)

    @server.on("room:start")
    async def room_start(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(RoomStartEvent, data)
        if event is None:
            return _error("invalid_payload")
        account_id = await _account_id_for_sid(server, sid)
        if account_id is None:
            return _error("authentication_required")
        room = await _load_room(app, event.room_id)
        if room is None or room.status is RoomStatus.CLOSED:
            return _error("room_not_found")
        if room.status is not RoomStatus.WAITING:
            return _error("room_not_waiting")
        if account_id != room.host_account_id:
            return _error("host_required")
        runtime = registry.get(event.room_id)
        if runtime is None or account_id not in runtime.members:
            return _error("room_not_joined")
        if matches.for_room(event.room_id) is not None:
            return _error("match_already_started")
        if len(runtime.members) < 2:
            return _error("not_enough_players")
        if any(not member.ready for member in runtime.members.values()):
            return _error("all_players_must_be_ready")
        try:
            rules = RoomRules.model_validate(room.rules)
        except ValidationError:
            return _error("invalid_room_rules")

        member_ids = list(runtime.members)
        randomizer.shuffle(member_ids)
        button_index = randomizer.randrange(len(member_ids))
        profile_names = await _load_profile_names(app, member_ids)
        match_id = uuid4()
        coordinator = MatchCoordinator(tuple(member_ids), rules, button_index=button_index)
        actor = MatchActor(coordinator, match_id=match_id)
        await actor.start()
        players = tuple(
            MatchPlayer(
                account_id=account_id,
                seat=seat,
                display_name=profile_names.get(account_id, str(account_id)),
            )
            for seat, account_id in enumerate(member_ids)
        )
        for player in players:
            runtime.members[player.account_id].seat = player.seat
        match = matches.add(MatchRuntime(event.room_id, match_id, actor, players))
        try:
            await _set_room_status(app, event.room_id, RoomStatus.ACTIVE)
        except Exception:
            await matches.remove(match)
            raise
        await _broadcast_room_snapshot(
            server,
            runtime,
            RoomStatus.ACTIVE,
            match_id=match.match_id,
        )
        await _broadcast_game_snapshots(server, runtime, match)
        return {
            "ok": True,
            "match_id": str(match_id),
            "room": room_snapshot_payload(runtime, RoomStatus.ACTIVE, match_id=match_id),
        }

    @server.on("game:action")
    async def game_action(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(GameActionEvent, data)
        if event is None:
            return await _reject(server, sid, "invalid_payload")
        account_id = await _account_id_for_sid(server, sid)
        if account_id is None:
            return await _reject(server, sid, "authentication_required", event)
        match = matches.for_match(event.match_id)
        if match is None:
            return await _reject(server, sid, "match_not_found", event)
        room_runtime = registry.get(match.room_id)
        if room_runtime is None:
            return await _reject(server, sid, "room_not_found", event)
        member = room_runtime.members.get(account_id)
        if member is None or member.sid != sid:
            return await _reject(server, sid, "not_a_member", event)
        try:
            match.player(account_id)
            response = await match.actor.submit(
                MatchCommand(
                    command_id=event.command_id,
                    action=ActionCommand(account_id, event.action, event.amount),
                    match_id=event.match_id,
                    hand_id=event.hand_id,
                    state_version=event.state_version,
                )
            )
        except (MatchRuntimeError, MatchCommandConflictError, ValueError) as error:
            return await _reject(server, sid, _game_error_code(error), event)

        result = response.result
        if not response.replayed:
            await _broadcast_game_snapshots(server, room_runtime, match)
            if result.settlement is not None and result.settled_hand_id is not None:
                await _emit_hand_settled(server, match, result)
            if result.match_status.value == "complete":
                await _emit_match_settled(server, match, result)
                await matches.remove(match)
                registry.reset_waiting_state(match.room_id)
                await _set_room_status(app, match.room_id, RoomStatus.WAITING)
                await _broadcast_room_snapshot(server, room_runtime, RoomStatus.WAITING)
        return {
            "ok": True,
            "command_id": str(result.command_id),
            "match_id": str(result.match_id),
            "hand_id": str(result.hand_id),
            "state_version": result.state_version,
            "replayed": response.replayed,
        }

    @server.on("game:request-snapshot")
    async def game_request_snapshot(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(GameRequestSnapshotEvent, data)
        if event is None:
            return _error("invalid_payload")
        account_id = await _account_id_for_sid(server, sid)
        if account_id is None:
            return _error("authentication_required")
        match = matches.for_match(event.match_id)
        if match is None:
            return _error("match_not_found")
        room_runtime = registry.get(match.room_id)
        if room_runtime is None or account_id not in room_runtime.members:
            return _error("not_a_member")
        await _broadcast_game_snapshots(server, room_runtime, match, target_sid=sid)
        return {"ok": True, "match_id": str(match.match_id)}


async def _account_id_for_sid(server: Any, sid: str) -> int | None:
    session = await server.get_session(sid)
    session_data = cast(dict[str, object], session) if isinstance(session, dict) else {}
    account_id = session_data.get("account_id")
    return account_id if isinstance(account_id, int) else None


async def _load_room(app: FastAPI, room_id: UUID) -> Room | None:
    database = cast(Database, app.state.database)
    async with database.session_factory() as db_session:
        return await db_session.scalar(select(Room).where(Room.room_id == room_id))


async def _load_profile_names(app: FastAPI, account_ids: list[int]) -> dict[int, str]:
    database = cast(Database, app.state.database)
    async with database.session_factory() as db_session:
        profiles = list(
            (
                await db_session.scalars(select(Profile).where(Profile.account_id.in_(account_ids)))
            ).all()
        )
    return {profile.account_id: profile.display_name for profile in profiles}


async def _set_room_status(app: FastAPI, room_id: UUID, status: RoomStatus) -> None:
    database = cast(Database, app.state.database)
    async with database.session_factory() as db_session:
        room = await db_session.scalar(select(Room).where(Room.room_id == room_id))
        if room is None:
            raise RuntimeError("Room disappeared while updating its status")
        room.status = status
        await db_session.commit()


def _parse_event(model_type: Any, data: Any) -> Any | None:
    try:
        return model_type.model_validate(data)
    except ValidationError:
        return None


async def _broadcast_room_snapshot(
    server: Any,
    runtime: RoomRuntime,
    status: RoomStatus,
    match_id: UUID | None = None,
) -> dict[str, Any]:
    payload = room_snapshot_payload(runtime, status, match_id=match_id)
    await server.emit("room:snapshot", payload, room=str(runtime.room_id))
    return {"ok": True, "room": payload}


def room_snapshot_payload(
    runtime: RoomRuntime,
    status: RoomStatus,
    match_id: UUID | None = None,
) -> dict[str, Any]:
    snapshot = RoomSnapshot(
        room_id=runtime.room_id,
        host_account_id=runtime.host_account_id,
        status=status,
        members=[
            RoomMemberSnapshot(
                account_id=member.account_id,
                ready=member.ready,
                seat=member.seat,
                connected=member.connected,
            )
            for member in sorted(runtime.members.values(), key=lambda member: member.account_id)
        ],
        match_id=match_id,
    )
    return snapshot.model_dump(mode="json")


async def restore_account_connection(
    server: Any,
    registry: RoomRegistry,
    matches: MatchRegistry,
    account_id: int,
    sid: str,
) -> None:
    room_id = registry.rebind_sid(account_id, sid)
    if room_id is None:
        return
    await server.enter_room(sid, str(room_id))
    runtime = registry.get(room_id)
    if runtime is None:
        return
    match = matches.for_room(room_id)
    await server.emit(
        "room:snapshot",
        room_snapshot_payload(
            runtime,
            RoomStatus.ACTIVE if match is not None else RoomStatus.WAITING,
            match_id=match.match_id if match is not None else None,
        ),
        to=sid,
    )


async def mark_account_disconnected(
    server: Any,
    registry: RoomRegistry,
    matches: MatchRegistry,
    sid: str,
) -> None:
    room_id = registry.disconnect_sid(sid)
    if room_id is None:
        return
    runtime = registry.get(room_id)
    if runtime is None:
        return
    match = matches.for_room(room_id)
    await server.emit(
        "room:snapshot",
        room_snapshot_payload(
            runtime,
            RoomStatus.ACTIVE if match is not None else RoomStatus.WAITING,
            match_id=match.match_id if match is not None else None,
        ),
        room=str(room_id),
    )


async def _broadcast_game_snapshots(
    server: Any,
    room_runtime: RoomRuntime,
    match: MatchRuntime,
    target_sid: str | None = None,
) -> None:
    actor_snapshot = match.actor.current_snapshot()
    public_payload = _public_snapshot_payload(room_runtime, match, actor_snapshot)
    if target_sid is None:
        await server.emit("game:public-snapshot", public_payload, room=str(match.room_id))
    else:
        await server.emit("game:public-snapshot", public_payload, to=target_sid)

    for player in match.players:
        member = room_runtime.members.get(player.account_id)
        if member is None or (target_sid is not None and member.sid != target_sid):
            continue
        private_payload = _private_snapshot_payload(
            room_runtime,
            match,
            actor_snapshot,
            player.account_id,
        )
        await server.emit("game:private-snapshot", private_payload, to=member.sid)


def _public_snapshot_payload(
    room_runtime: RoomRuntime,
    match: MatchRuntime,
    snapshot: MatchActorSnapshot,
) -> dict[str, Any]:
    public = snapshot.public
    players = [
        GamePlayerSnapshot(
            account_id=account_id,
            seat=match.player(account_id).seat,
            display_name=match.player(account_id).display_name,
            stack=public.stacks[index],
            bet=public.bets[index],
            folded=public.folded[index],
            all_in=public.all_in[index],
            connected=(
                room_runtime.members[account_id].connected
                if account_id in room_runtime.members
                else False
            ),
        )
        for index, account_id in enumerate(public.account_ids)
    ]
    return GamePublicSnapshot(
        match_id=snapshot.match_id,
        hand_id=snapshot.hand_id,
        hand_number=snapshot.hand_number,
        state_version=public.state_version,
        street=public.street,
        button_account_id=snapshot.button_account_id,
        actor_account_id=public.actor_account_id,
        board=list(public.board),
        pot_amounts=list(public.pot_amounts),
        complete=public.complete,
        players=players,
    ).model_dump(mode="json")


def _private_snapshot_payload(
    room_runtime: RoomRuntime,
    match: MatchRuntime,
    snapshot: MatchActorSnapshot,
    account_id: int,
) -> dict[str, Any]:
    private = match.actor.private_snapshot(account_id)
    public = GamePublicSnapshot.model_validate(
        _public_snapshot_payload(room_runtime, match, snapshot)
    )
    return GamePrivateSnapshot(
        **public.model_dump(),
        account_id=account_id,
        hole_cards=list(private.hole_cards),
        legal_actions=[GameLegalAction.from_domain(action) for action in private.legal_actions],
    ).model_dump(mode="json")


async def _emit_hand_settled(server: Any, match: MatchRuntime, result: Any) -> None:
    settlement = result.settlement
    if settlement is None or result.settled_hand_id is None or result.settled_hand_number is None:
        return
    payload = GameHandSettled(
        match_id=match.match_id,
        hand_id=result.settled_hand_id,
        hand_number=result.settled_hand_number,
        state_version=result.state_version,
        account_ids=list(match.actor.coordinator.player_ids),
        final_stacks=list(settlement.final_stacks),
        payoffs=list(settlement.payoffs),
    ).model_dump(mode="json")
    await server.emit("game:hand-settled", payload, room=str(match.room_id))


async def _emit_match_settled(server: Any, match: MatchRuntime, result: Any) -> None:
    settlement = result.settlement
    if settlement is None:
        return
    payload = GameMatchSettled(
        match_id=match.match_id,
        state_version=result.state_version,
        account_ids=list(match.actor.coordinator.player_ids),
        final_stacks=list(settlement.final_stacks),
        status=result.match_status.value,
    ).model_dump(mode="json")
    await server.emit("game:match-settled", payload, room=str(match.room_id))


async def _reject(
    server: Any,
    sid: str,
    error: str,
    event: GameActionEvent | None = None,
) -> dict[str, Any]:
    payload = GameActionRejected(
        command_id=event.command_id if event is not None else None,
        match_id=event.match_id if event is not None else None,
        hand_id=event.hand_id if event is not None else None,
        state_version=event.state_version if event is not None else None,
        error=error,
    ).model_dump(mode="json")
    await server.emit("game:action-rejected", payload, to=sid)
    return {"ok": False, **payload}


def _game_error_code(error: Exception) -> str:
    message = str(error).lower()
    if "stale" in message or "version" in message:
        return "stale_state_version"
    if "another match" in message:
        return "match_mismatch"
    if "another hand" in message:
        return "hand_mismatch"
    if "current actor" in message:
        return "not_current_actor"
    if "not seated" in message:
        return "not_a_member"
    if "command id" in message:
        return "command_id_reused"
    return "invalid_action"


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


__all__ = [
    "mark_account_disconnected",
    "register_room_handlers",
    "restore_account_connection",
    "room_snapshot_payload",
]
