"""Serialized command actor for one in-memory match."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import UUID

from app.game_engine.contracts import ActionCommand, AppliedAction, PublicHandSnapshot
from app.game_engine.match import MatchCoordinator, MatchStatus


class MatchActorStateError(RuntimeError):
    """Raised when an actor is used outside its lifecycle."""


@dataclass(frozen=True)
class MatchCommand:
    command_id: UUID
    action: ActionCommand


@dataclass(frozen=True)
class MatchCommandResult:
    command_id: UUID
    applied: AppliedAction
    snapshot: PublicHandSnapshot
    match_status: MatchStatus


@dataclass
class _QueuedCommand:
    command: MatchCommand
    future: asyncio.Future[MatchCommandResult]


class MatchActor:
    def __init__(self, coordinator: MatchCoordinator) -> None:
        self._coordinator = coordinator
        self._queue: asyncio.Queue[_QueuedCommand | None] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None
        self._inflight: dict[UUID, asyncio.Future[MatchCommandResult]] = {}
        self._processed: dict[UUID, MatchCommandResult] = {}

    async def start(self) -> None:
        if self._task is not None:
            return
        self._coordinator.start_hand()
        self._task = asyncio.create_task(self._run(), name="dokerface-match-actor")

    async def submit(self, command: MatchCommand) -> MatchCommandResult:
        if self._task is None:
            raise MatchActorStateError("Match actor has not started")
        processed = self._processed.get(command.command_id)
        if processed is not None:
            return processed
        inflight = self._inflight.get(command.command_id)
        if inflight is not None:
            return await inflight

        future = asyncio.get_running_loop().create_future()
        self._inflight[command.command_id] = future
        await self._queue.put(_QueuedCommand(command, future))
        return await future

    async def close(self) -> None:
        if self._task is None:
            return
        await self._queue.put(None)
        await self._task
        self._task = None

    @property
    def coordinator(self) -> MatchCoordinator:
        return self._coordinator

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
                self._processed[command.command_id] = result
                if not queued.future.done():
                    queued.future.set_result(result)

    def _apply(self, command: MatchCommand) -> MatchCommandResult:
        applied = self._coordinator.apply_action(command.action)
        snapshot = self._coordinator.public_snapshot()
        if self._coordinator.hand.is_complete():
            self._coordinator.settle_hand()
            if self._coordinator.status is MatchStatus.ACTIVE:
                self._coordinator.start_hand()
        return MatchCommandResult(
            command_id=command.command_id,
            applied=applied,
            snapshot=snapshot,
            match_status=self._coordinator.status,
        )


__all__ = [
    "MatchActor",
    "MatchActorStateError",
    "MatchCommand",
    "MatchCommandResult",
]
