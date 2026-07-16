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
from app.chat.service import ChatService
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
from app.matches.persistence import (
    ActionHistory,
    HandHistory,
    HandPlayerHistory,
    MatchHistoryPersistenceService,
    MatchPlayerSeed,
    MatchResult,
    PotHistory,
)
from app.matches.registry import MatchPlayer, MatchRegistry, MatchRuntime, MatchRuntimeError
from app.ratings.service import RatingService, RatingSettlement
from app.realtime.schemas import (
    ChatMessagePayload,
    ChatSendEvent,
    EmotePayload,
    EmoteSendEvent,
    GameActionEvent,
    GameActionRejected,
    GameHandSettled,
    GameLegalAction,
    GameMatchSettled,
    GamePlayerSnapshot,
    GamePrivateSnapshot,
    GamePublicSnapshot,
    GameRequestSnapshotEvent,
    LobbyRoomsUpdatedEvent,
    RoomJoinEvent,
    RoomKickedEvent,
    RoomKickEvent,
    RoomLeaveEvent,
    RoomMemberSnapshot,
    RoomReadyEvent,
    RoomSnapshot,
    RoomStartEvent,
)
from app.rooms.config import RoomRules, RoomVisibility
from app.rooms.models import Room, RoomStatus
from app.rooms.registry import RoomRegistry, RoomRuntime, RoomRuntimeError
from app.statistics.reducer import StatisticsAction, StatisticsHand, StatisticsPlayer
from app.statistics.service import StatisticsPersistenceService


def register_room_handlers(
    server: Any,
    app: FastAPI,
    settings: Settings,
    registry: RoomRegistry,
    match_registry: MatchRegistry | None = None,
    random_source: Random | SystemRandom | None = None,
    history_service: MatchHistoryPersistenceService | None = None,
    rating_service: RatingService | None = None,
    statistics_service: StatisticsPersistenceService | None = None,
) -> None:
    matches = match_registry or MatchRegistry()
    randomizer = random_source or SystemRandom()
    history = history_service or MatchHistoryPersistenceService()
    ratings = rating_service or RatingService()
    statistics = statistics_service or StatisticsPersistenceService()

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
        was_last_member = len(runtime.members) == 1
        try:
            registry.leave(event.room_id, account_id)
        except RoomRuntimeError as error:
            return _error(_runtime_error_code(error))
        await server.leave_room(sid, str(event.room_id))
        if was_last_member:
            await _set_room_status(app, event.room_id, RoomStatus.CLOSED)
            registry.remove_if_empty(event.room_id)
            lobby_payload = LobbyRoomsUpdatedEvent().model_dump(mode="json")
            await server.emit("lobby:rooms-updated", lobby_payload)
            return {
                "ok": True,
                "room": room_snapshot_payload(runtime, RoomStatus.CLOSED),
            }
        await _set_room_host(app, event.room_id, runtime.host_account_id)
        return await _broadcast_room_snapshot(server, runtime, RoomStatus.WAITING)

    @server.on("room:kick")
    async def room_kick(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(RoomKickEvent, data)
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
        if account_id != runtime.host_account_id:
            return _error("host_required")
        target = runtime.members.get(event.target_account_id)
        if target is None:
            return _error("not_a_member")
        if target.account_id == runtime.host_account_id:
            return _error("cannot_kick_host")
        try:
            # Emit room:kicked event to the target before leaving
            kicked_payload = RoomKickedEvent(room_id=event.room_id, reason="kicked").model_dump(
                mode="json"
            )
            await server.emit("room:kicked", kicked_payload, to=target.sid)

            registry.leave(event.room_id, target.account_id)
        except RoomRuntimeError as error:
            return _error(_runtime_error_code(error))
        await server.leave_room(target.sid, str(event.room_id))
        return await _broadcast_room_snapshot(server, runtime, RoomStatus.WAITING)

    @server.on("chat:send")
    async def chat_send(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(ChatSendEvent, data)
        if event is None:
            return _error("invalid_payload")
        account_id = await _account_id_for_sid(server, sid)
        if account_id is None:
            return _error("authentication_required")
        runtime = registry.get(event.room_id)
        if runtime is None:
            return _error("room_not_joined")
        member = runtime.members.get(account_id)
        if member is None or member.sid != sid:
            return _error("not_a_member")
        try:
            message = await _persist_chat_message(
                app,
                event.room_id,
                account_id,
                event.message_type,
                event.content,
            )
        except Exception:
            return _error("chat_persistence_failed")
        payload = ChatMessagePayload(
            message_id=message.message_id,
            room_id=message.room_id,
            account_id=message.account_id,
            message_type=event.message_type,
            content=message.content,
            created_at=message.created_at,
        ).model_dump(mode="json")
        await server.emit("chat:message", payload, room=str(event.room_id))
        return {"ok": True, "message": payload}

    @server.on("emote:send")
    async def emote_send(sid: str, data: Any) -> dict[str, Any]:
        event = _parse_event(EmoteSendEvent, data)
        if event is None:
            return _error("invalid_payload")
        account_id = await _account_id_for_sid(server, sid)
        if account_id is None:
            return _error("authentication_required")
        runtime = registry.get(event.room_id)
        if runtime is None:
            return _error("room_not_joined")
        member = runtime.members.get(account_id)
        if member is None or member.sid != sid:
            return _error("not_a_member")
        if event.target_account_id is not None and event.target_account_id not in runtime.members:
            return _error("target_not_a_member")
        payload = EmotePayload(
            room_id=event.room_id,
            account_id=account_id,
            emote=event.emote,
            target_account_id=event.target_account_id,
        ).model_dump(mode="json")
        await server.emit("emote:received", payload, room=str(event.room_id))
        return {"ok": True, "emote": payload}

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
        actor = MatchActor(
            coordinator,
            match_id=match_id,
            decision_timeout_seconds=rules.decision_timeout_seconds,
        )
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
            await _persist_match_start(
                app,
                history,
                room_id=event.room_id,
                match_id=match_id,
                rules_snapshot=room.rules,
                end_mode=rules.end_mode.value,
                players=tuple(
                    MatchPlayerSeed(
                        player.account_id,
                        player.seat,
                        player.display_name,
                        rules.starting_chips,
                    )
                    for player in players
                ),
            )
            await _set_room_status(app, event.room_id, RoomStatus.ACTIVE)
        except Exception:
            await _void_persistence_failure(app, history, match)
            await matches.remove(match)
            return _error("match_persistence_failed")
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
            if result.completed_hand is not None:
                try:
                    await _persist_completed_hand(
                        app,
                        history,
                        ratings,
                        statistics,
                        match,
                        result,
                    )
                except Exception:
                    await _void_persistence_failure(app, history, match)
                    await matches.remove(match)
                    registry.reset_waiting_state(match.room_id)
                    await _set_room_status(app, match.room_id, RoomStatus.WAITING)
                    await _broadcast_room_snapshot(server, room_runtime, RoomStatus.WAITING)
                    return await _reject(server, sid, "match_persistence_failed", event)
            _schedule_disconnected_timeout(room_runtime, match)
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


async def _persist_chat_message(
    app: FastAPI,
    room_id: UUID,
    account_id: int,
    message_type: str,
    content: str,
) -> Any:
    database = cast(Database, app.state.database)
    async with database.session_factory() as db_session:
        return await ChatService().create_message(
            db_session,
            room_id=room_id,
            account_id=account_id,
            message_type=message_type,
            content=content,
        )


async def _persist_match_start(
    app: FastAPI,
    service: MatchHistoryPersistenceService,
    *,
    room_id: UUID,
    match_id: UUID,
    rules_snapshot: dict[str, object],
    end_mode: str,
    players: tuple[MatchPlayerSeed, ...],
) -> None:
    database = cast(Database, app.state.database)
    async with database.session_factory() as db_session:
        await service.create_match(
            db_session,
            match_id=match_id,
            room_id=room_id,
            rules_snapshot=rules_snapshot,
            end_mode=end_mode,
            players=players,
        )


async def _persist_completed_hand(
    app: FastAPI,
    service: MatchHistoryPersistenceService,
    rating_service: RatingService,
    statistics_service: StatisticsPersistenceService,
    match: MatchRuntime,
    result: Any,
) -> None:
    completed = result.completed_hand
    if completed is None:
        return
    history = _hand_history(match, completed)
    database = cast(Database, app.state.database)
    async with database.session_factory() as db_session, db_session.begin():
        await service.persist_hand(db_session, history)
        if match.actor.coordinator.rules.counted_in_stats:
            await statistics_service.apply_hand(db_session, _statistics_hand(match, completed))
        if result.match_status.value == "complete":
            await service.complete_match(
                db_session,
                match_id=match.match_id,
                results=_match_results(match),
            )
            await rating_service.settle_match(
                db_session,
                match_id=match.match_id,
                results=_rating_results(match),
            )
            if match.actor.coordinator.rules.counted_in_stats:
                await statistics_service.apply_profitable_matches(
                    db_session,
                    {
                        player.account_id: match.actor.coordinator.stacks[player.account_id]
                        > match.actor.coordinator.rules.starting_chips
                        for player in match.players
                    },
                )


def _hand_history(match: MatchRuntime, completed: Any) -> HandHistory:
    public = completed.public
    shown_accounts = {
        action.account_id for action in completed.actions if action.action.value == "show"
    }
    players = tuple(
        HandPlayerHistory(
            account_id=account_id,
            hole_cards=completed.private_snapshots[account_id].hole_cards,
            folded=public.folded[index],
            all_in=public.all_in[index],
            shown=account_id in shown_accounts,
            invested_chips=(
                completed.settlement.contributions[index]
                if len(completed.settlement.contributions) == len(public.account_ids)
                else max(0, completed.starting_stacks[index] - public.stacks[index])
            ),
            won_chips=max(0, completed.settlement.payoffs[index]),
        )
        for index, account_id in enumerate(public.account_ids)
    )
    actions = tuple(
        ActionHistory(
            sequence_no=action.sequence_no,
            state_version=action.state_version,
            account_id=action.account_id,
            street=action.street,
            action=action.action.value,
            amount=action.amount,
        )
        for action in completed.actions
    )
    if completed.settlement.pots:
        pots = tuple(
            PotHistory(
                pot_number=index + 1,
                amount=pot.amount,
                eligible_account_ids=tuple(
                    public.account_ids[player_index] for player_index in pot.eligible_indices
                ),
                winner_payouts={
                    str(public.account_ids[player_index]): payout
                    for player_index, payout in enumerate(pot.payouts)
                    if payout > 0
                },
            )
            for index, pot in enumerate(completed.settlement.pots)
        )
    else:
        eligible = tuple(
            account_id
            for index, account_id in enumerate(public.account_ids)
            if not public.folded[index]
        )
        pots = tuple(
            PotHistory(
                pot_number=index + 1,
                amount=amount,
                eligible_account_ids=eligible,
                winner_payouts=(
                    {
                        str(account_id): payoff
                        for account_id, payoff in zip(
                            public.account_ids,
                            completed.settlement.payoffs,
                            strict=True,
                        )
                        if payoff > 0
                    }
                    if index == 0
                    else {}
                ),
            )
            for index, amount in enumerate(public.pot_amounts)
        )
    return HandHistory(
        hand_id=completed.hand_id,
        match_id=match.match_id,
        hand_number=completed.hand_number,
        button_account_id=completed.button_account_id,
        small_blind=completed.small_blind,
        big_blind=completed.big_blind,
        public_board=public.board,
        settlement_summary={
            "final_stacks": list(completed.settlement.final_stacks),
            "payoffs": list(completed.settlement.payoffs),
        },
        players=players,
        actions=actions,
        pots=pots,
    )


def _match_results(match: MatchRuntime) -> tuple[MatchResult, ...]:
    stacks = match.actor.coordinator.stacks
    return tuple(
        MatchResult(
            account_id=player.account_id,
            final_chips=stacks[player.account_id],
            finishing_rank=1
            + sum(
                other_stack > stacks[player.account_id]
                for account_id, other_stack in stacks.items()
                if account_id != player.account_id
            ),
        )
        for player in match.players
    )


def _rating_results(match: MatchRuntime) -> tuple[RatingSettlement, ...]:
    return tuple(
        RatingSettlement(result.account_id, result.finishing_rank or 1)
        for result in _match_results(match)
    )


def _statistics_hand(match: MatchRuntime, completed: Any) -> StatisticsHand:
    public = completed.public
    shown_accounts = {
        action.account_id for action in completed.actions if action.action.value == "show"
    }
    button_index = public.account_ids.index(completed.button_account_id)
    positions = {
        account_id: (
            "button"
            if index == button_index
            else "small_blind"
            if index == (button_index + 1) % len(public.account_ids)
            else "big_blind"
            if index == (button_index + 2) % len(public.account_ids)
            else f"seat_{index}"
        )
        for index, account_id in enumerate(public.account_ids)
    }
    return StatisticsHand(
        hand_id=completed.hand_id,
        match_id=match.match_id,
        pot_amount=(
            sum(pot.amount for pot in completed.settlement.pots)
            if completed.settlement.pots
            else sum(public.pot_amounts)
        ),
        players=tuple(
            StatisticsPlayer(
                account_id=account_id,
                position=positions[account_id],
                folded=public.folded[index],
                all_in=public.all_in[index],
                won_chips=max(0, completed.settlement.payoffs[index]),
                showdown=account_id in shown_accounts,
            )
            for index, account_id in enumerate(public.account_ids)
        ),
        actions=tuple(
            StatisticsAction(
                account_id=action.account_id,
                street=action.street,
                action=action.action,
                amount=action.amount,
            )
            for action in completed.actions
        ),
        reached_showdown=any(
            action.action.value in {"show", "muck"} for action in completed.actions
        ),
    )


async def _void_persistence_failure(
    app: FastAPI,
    service: MatchHistoryPersistenceService,
    match: MatchRuntime,
) -> None:
    database = cast(Database, app.state.database)
    try:
        async with database.session_factory() as db_session:
            await service.void_match(
                db_session,
                match_id=match.match_id,
                reason="persistence_failure",
            )
            await db_session.commit()
    except Exception:
        return


async def _set_room_host(app: FastAPI, room_id: UUID, host_account_id: int) -> None:
    database = cast(Database, app.state.database)
    async with database.session_factory() as db_session:
        room = await db_session.scalar(select(Room).where(Room.room_id == room_id))
        if room is None:
            raise RuntimeError("Room disappeared while transferring host")
        room.host_account_id = host_account_id
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

    # Broadcast lobby update to all connected clients
    lobby_payload = LobbyRoomsUpdatedEvent().model_dump(mode="json")
    await server.emit("lobby:rooms-updated", lobby_payload)

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
    if match is not None:
        match.actor.cancel_disconnect_timeout(account_id)
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
    account_id: int,
) -> None:
    room_id = registry.disconnect_sid(sid)
    if room_id is None:
        return
    runtime = registry.get(room_id)
    if runtime is None:
        return
    match = matches.for_room(room_id)
    if match is not None:
        match.actor.schedule_disconnect_timeout(account_id)
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
        action_deadline_at=snapshot.action_deadline_at,
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


def _schedule_disconnected_timeout(room_runtime: RoomRuntime, match: MatchRuntime) -> None:
    account_id = match.actor.current_snapshot().public.actor_account_id
    if account_id is None:
        return
    member = room_runtime.members.get(account_id)
    if member is not None and not member.connected:
        match.actor.schedule_disconnect_timeout(account_id)


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
