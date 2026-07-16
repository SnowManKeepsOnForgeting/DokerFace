"""Serialized command actor for one in-memory match."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from uuid import UUID, uuid4

from app.game_engine.contracts import (
    ActionCommand,
    ActionType,
    AppliedAction,
    HandSettlement,
    PrivateHandSnapshot,
    PublicHandSnapshot,
)
from app.game_engine.match import MatchCoordinator, MatchStatus


class MatchActorStateError(RuntimeError):
    """Raised when an actor is used outside its lifecycle."""


class MatchCommandConflictError(ValueError):
    """Raised when a command targets a stale or unrelated match state."""


class MatchCommandSource(StrEnum):
    PLAYER = "player"
    TIMEOUT = "timeout"
    DISCONNECT_TIMEOUT = "disconnect_timeout"


@dataclass(frozen=True)
class MatchActorSnapshot:
    match_id: UUID
    hand_id: UUID
    hand_number: int
    button_account_id: int
    public: PublicHandSnapshot
    action_deadline_at: datetime | None = None


@dataclass(frozen=True)
class MatchCommand:
    command_id: UUID
    action: ActionCommand
    match_id: UUID | None = None
    hand_id: UUID | None = None
    state_version: int | None = None
    source: MatchCommandSource = MatchCommandSource.PLAYER


@dataclass(frozen=True)
class MatchCommandResult:
    command_id: UUID
    applied: AppliedAction
    snapshot: PublicHandSnapshot
    match_status: MatchStatus
    state_version: int
    match_id: UUID
    hand_id: UUID
    settled_hand_id: UUID | None = None
    settled_hand_number: int | None = None
    settlement: HandSettlement | None = None


@dataclass(frozen=True)
class MatchCommandResponse:
    result: MatchCommandResult
    replayed: bool


@dataclass
class _QueuedCommand:
    command: MatchCommand
    future: asyncio.Future[MatchCommandResult]


class MatchActor:
    def __init__(
        self,
        coordinator: MatchCoordinator,
        match_id: UUID | None = None,
        decision_timeout_seconds: int | None = None,
        disconnect_timeout_seconds: int = 60,
        clock: Callable[[], datetime] | None = None,
        sleeper: Callable[[float], Awaitable[object]] | None = None,
    ) -> None:
        self._coordinator = coordinator
        self._match_id = match_id or uuid4()
        self._decision_timeout_seconds = decision_timeout_seconds
        self._disconnect_timeout_seconds = disconnect_timeout_seconds
        self._clock = clock or (lambda: datetime.now(UTC))
        self._sleeper = sleeper or asyncio.sleep
        self._hand_id: UUID | None = None
        self._action_deadline_at: datetime | None = None
        self._timer_task: asyncio.Task[object] | None = None
        self._disconnect_timer_task: asyncio.Task[object] | None = None
        self._disconnect_timer_account_id: int | None = None
        self._terminal_snapshot: MatchActorSnapshot | None = None
        self._terminal_private: dict[int, PrivateHandSnapshot] = {}
        self._queue: asyncio.Queue[_QueuedCommand | None] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None
        self._inflight: dict[UUID, tuple[MatchCommand, asyncio.Future[MatchCommandResult]]] = {}
        self._processed: dict[UUID, tuple[MatchCommand, MatchCommandResult]] = {}
        self._state_version = 0

    async def start(self) -> MatchActorSnapshot:
        if self._task is not None:
            return self.current_snapshot()
        self._coordinator.start_hand()
        self._hand_id = uuid4()
        self._task = asyncio.create_task(self._run(), name="dokerface-match-actor")
        self._schedule_action_timer()
        return self.current_snapshot()

    async def submit(self, command: MatchCommand) -> MatchCommandResponse:
        if self._task is None or self._hand_id is None:
            raise MatchActorStateError("Match actor has not started")
        processed = self._processed.get(command.command_id)
        if processed is not None:
            original, result = processed
            self._validate_command_identity(command, original)
            return MatchCommandResponse(result=result, replayed=True)
        inflight = self._inflight.get(command.command_id)
        if inflight is not None:
            original, future = inflight
            self._validate_command_identity(command, original)
            return MatchCommandResponse(result=await future, replayed=True)

        future = asyncio.get_running_loop().create_future()
        self._inflight[command.command_id] = (command, future)
        await self._queue.put(_QueuedCommand(command, future))
        return MatchCommandResponse(result=await future, replayed=False)

    async def submit_timeout(
        self,
        command_id: UUID,
        *,
        match_id: UUID,
        hand_id: UUID,
        state_version: int,
        source: MatchCommandSource = MatchCommandSource.TIMEOUT,
    ) -> MatchCommandResponse:
        if source is MatchCommandSource.PLAYER:
            raise ValueError("Timeout command must use a timeout source")
        actor_account_id = self.current_snapshot().public.actor_account_id
        if actor_account_id is None:
            raise MatchActorStateError("Match has no current actor")
        return await self.submit(
            MatchCommand(
                command_id=command_id,
                action=ActionCommand(actor_account_id, ActionType.FOLD),
                match_id=match_id,
                hand_id=hand_id,
                state_version=state_version,
                source=source,
            )
        )

    def schedule_disconnect_timeout(self, account_id: int) -> bool:
        if self._decision_timeout_seconds is not None:
            return False
        snapshot = self.current_snapshot()
        if snapshot.public.actor_account_id != account_id:
            return False
        self._cancel_disconnect_timeout()
        self._disconnect_timer_account_id = account_id
        self._action_deadline_at = self._clock() + timedelta(
            seconds=self._disconnect_timeout_seconds
        )
        self._disconnect_timer_task = asyncio.create_task(
            self._run_disconnect_timeout(
                account_id,
                snapshot.hand_id,
                snapshot.public.state_version,
            ),
            name="dokerface-disconnect-action-timer",
        )
        return True

    def cancel_disconnect_timeout(self, account_id: int) -> None:
        if self._disconnect_timer_account_id == account_id:
            self._cancel_disconnect_timeout()
            self._action_deadline_at = None

    async def close(self) -> None:
        if self._task is None:
            return
        self._cancel_action_timer()
        self._cancel_disconnect_timeout()
        await self._queue.put(None)
        await self._task
        self._task = None

    @property
    def coordinator(self) -> MatchCoordinator:
        return self._coordinator

    @property
    def match_id(self) -> UUID:
        return self._match_id

    @property
    def state_version(self) -> int:
        return self._state_version

    def current_snapshot(self) -> MatchActorSnapshot:
        if self._hand_id is None:
            raise MatchActorStateError("Match actor has not started")
        if self._terminal_snapshot is not None:
            return self._terminal_snapshot
        return MatchActorSnapshot(
            match_id=self._match_id,
            hand_id=self._hand_id,
            hand_number=self._coordinator.hand_number,
            button_account_id=self._coordinator.button_account_id,
            action_deadline_at=self._action_deadline_at,
            public=replace(
                self._coordinator.public_snapshot(),
                state_version=self._state_version,
            ),
        )

    def private_snapshot(self, account_id: int) -> PrivateHandSnapshot:
        if self._terminal_snapshot is not None:
            snapshot = self._terminal_private.get(account_id)
            if snapshot is None:
                raise MatchCommandConflictError("Account is not seated in this match")
            return replace(
                snapshot,
                public=self._terminal_snapshot.public,
            )
        return replace(
            self._coordinator.hand.private_snapshot(account_id),
            public=replace(
                self._coordinator.hand.public_snapshot(),
                state_version=self._state_version,
            ),
        )

    async def _run(self) -> None:
        while True:
            queued = await self._queue.get()
            if queued is None:
                return
            command = queued.command
            try:
                result = self._apply(command)
            except Exception as error:
                self._inflight.pop(command.command_id, None)
                if not queued.future.done():
                    queued.future.set_exception(error)
            else:
                self._inflight.pop(command.command_id, None)
                self._processed[command.command_id] = (command, result)
                if not queued.future.done():
                    queued.future.set_result(result)

    def _apply(self, command: MatchCommand) -> MatchCommandResult:
        self._validate_current_command(command)
        hand_id = self._require_hand_id()
        hand_number = self._coordinator.hand_number
        button_account_id = self._coordinator.button_account_id
        applied = self._coordinator.apply_action(command.action)
        self._state_version += 1
        public = replace(
            self._coordinator.public_snapshot(),
            state_version=self._state_version,
        )
        if self._coordinator.hand.is_complete():
            terminal_private = {
                account_id: self._coordinator.hand.private_snapshot(account_id)
                for account_id in self._coordinator.player_ids
            }
            settlement = self._coordinator.settle_hand()
            terminal_public = replace(
                public,
                stacks=settlement.final_stacks,
                bets=(0,) * len(settlement.final_stacks),
                pot_amounts=(),
                actor_account_id=None,
                street="settlement",
            )
            if self._coordinator.status is MatchStatus.ACTIVE:
                self._coordinator.start_hand()
                self._hand_id = uuid4()
                self._schedule_action_timer()
                public = replace(
                    self._coordinator.public_snapshot(),
                    state_version=self._state_version,
                )
                return MatchCommandResult(
                    command_id=command.command_id,
                    applied=applied,
                    snapshot=public,
                    match_status=self._coordinator.status,
                    state_version=self._state_version,
                    match_id=self._match_id,
                    hand_id=self._require_hand_id(),
                    settled_hand_id=hand_id,
                    settled_hand_number=hand_number,
                    settlement=settlement,
                )
            self._terminal_snapshot = MatchActorSnapshot(
                match_id=self._match_id,
                hand_id=hand_id,
                hand_number=hand_number,
                button_account_id=button_account_id,
                public=terminal_public,
                action_deadline_at=None,
            )
            self._terminal_private = terminal_private
            self._action_deadline_at = None
            self._cancel_action_timer()
            self._cancel_disconnect_timeout()
            return MatchCommandResult(
                command_id=command.command_id,
                applied=applied,
                snapshot=terminal_public,
                match_status=self._coordinator.status,
                state_version=self._state_version,
                match_id=self._match_id,
                hand_id=hand_id,
                settled_hand_id=hand_id,
                settled_hand_number=hand_number,
                settlement=settlement,
            )
        self._schedule_action_timer()
        return MatchCommandResult(
            command_id=command.command_id,
            applied=applied,
            snapshot=public,
            match_status=self._coordinator.status,
            state_version=self._state_version,
            match_id=self._match_id,
            hand_id=hand_id,
        )

    def _validate_current_command(self, command: MatchCommand) -> None:
        if command.source is not MatchCommandSource.PLAYER and (
            command.match_id is None or command.hand_id is None or command.state_version is None
        ):
            raise MatchCommandConflictError(
                "Timeout command requires match, hand, and state version"
            )
        if command.match_id is not None and command.match_id != self._match_id:
            raise MatchCommandConflictError("Command targets another match")
        if command.hand_id is not None and command.hand_id != self._require_hand_id():
            raise MatchCommandConflictError("Command targets another hand")
        if command.state_version is not None and command.state_version != self._state_version:
            raise MatchCommandConflictError("Command state version is stale")

    @staticmethod
    def _validate_command_identity(command: MatchCommand, original: MatchCommand) -> None:
        if command != original:
            raise MatchCommandConflictError("Command ID was reused with different payload")

    def _require_hand_id(self) -> UUID:
        if self._hand_id is None:
            raise MatchActorStateError("Match actor has not started")
        return self._hand_id

    def _schedule_action_timer(self) -> None:
        self._cancel_action_timer()
        self._cancel_disconnect_timeout()
        snapshot = self._coordinator.public_snapshot()
        if self._decision_timeout_seconds is None or snapshot.actor_account_id is None:
            self._action_deadline_at = None
            return
        self._action_deadline_at = self._clock() + timedelta(seconds=self._decision_timeout_seconds)
        self._timer_task = asyncio.create_task(
            self._run_action_timer(
                self._require_hand_id(),
                self._state_version,
            ),
            name="dokerface-action-timer",
        )

    def _cancel_action_timer(self) -> None:
        task = self._timer_task
        self._timer_task = None
        if task is not None and task is not asyncio.current_task():
            task.cancel()

    def _cancel_disconnect_timeout(self) -> None:
        task = self._disconnect_timer_task
        self._disconnect_timer_task = None
        self._disconnect_timer_account_id = None
        if task is not None and task is not asyncio.current_task():
            task.cancel()

    async def _run_action_timer(self, hand_id: UUID, state_version: int) -> None:
        try:
            await self._sleeper(self._decision_timeout_seconds or 0)
            await self.submit_timeout(
                uuid4(),
                match_id=self._match_id,
                hand_id=hand_id,
                state_version=state_version,
            )
        except (MatchActorStateError, MatchCommandConflictError, ValueError):
            return

    async def _run_disconnect_timeout(
        self,
        account_id: int,
        hand_id: UUID,
        state_version: int,
    ) -> None:
        try:
            await self._sleeper(self._disconnect_timeout_seconds)
            snapshot = self.current_snapshot()
            if snapshot.public.actor_account_id != account_id:
                return
            await self.submit_timeout(
                uuid4(),
                match_id=self._match_id,
                hand_id=hand_id,
                state_version=state_version,
                source=MatchCommandSource.DISCONNECT_TIMEOUT,
            )
        except (MatchActorStateError, MatchCommandConflictError, ValueError):
            return


__all__ = [
    "MatchActor",
    "MatchActorSnapshot",
    "MatchActorStateError",
    "MatchCommand",
    "MatchCommandConflictError",
    "MatchCommandResponse",
    "MatchCommandResult",
    "MatchCommandSource",
]
