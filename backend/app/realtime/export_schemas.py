"""Script to export Socket.IO Pydantic event schemas to JSON Schema files."""

import json
from pathlib import Path

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
    LobbyRoomsUpdatedEvent,
    RoomJoinEvent,
    RoomKickedEvent,
    RoomLeaveEvent,
    RoomMemberSnapshot,
    RoomReadyEvent,
    RoomSnapshot,
    RoomStartEvent,
)

SCHEMAS = {
    "GameActionEvent": GameActionEvent,
    "GameActionRejected": GameActionRejected,
    "GameHandSettled": GameHandSettled,
    "GameLegalAction": GameLegalAction,
    "GameMatchSettled": GameMatchSettled,
    "GamePlayerSnapshot": GamePlayerSnapshot,
    "GamePrivateSnapshot": GamePrivateSnapshot,
    "GamePublicSnapshot": GamePublicSnapshot,
    "GameRequestSnapshotEvent": GameRequestSnapshotEvent,
    "RoomJoinEvent": RoomJoinEvent,
    "RoomLeaveEvent": RoomLeaveEvent,
    "RoomMemberSnapshot": RoomMemberSnapshot,
    "RoomReadyEvent": RoomReadyEvent,
    "RoomSnapshot": RoomSnapshot,
    "RoomStartEvent": RoomStartEvent,
    "RoomKickedEvent": RoomKickedEvent,
    "LobbyRoomsUpdatedEvent": LobbyRoomsUpdatedEvent,
}


def main() -> None:
    # Output path matches the root schema export location
    out_dir = Path(__file__).resolve().parents[3] / "realtime-schemas"
    out_dir.mkdir(parents=True, exist_ok=True)

    for name, model in SCHEMAS.items():
        schema = model.model_json_schema()
        out_path = out_dir / f"{name}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(schema, f, indent=2)
            f.write("\n")
        print(f"Exported {name} to {out_path}")


if __name__ == "__main__":
    main()
