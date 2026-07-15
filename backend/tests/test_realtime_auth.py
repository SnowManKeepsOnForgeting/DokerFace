import pytest

from app.realtime.auth import extract_session_token, is_allowed_origin
from app.realtime.connections import ConnectionRegistry


@pytest.mark.parametrize(
    ("environ", "expected"),
    [
        ({"HTTP_COOKIE": "dokerface_session=session-token"}, "session-token"),
        (
            {"HTTP_COOKIE": "other=value; dokerface_session=session-token; flag=yes"},
            "session-token",
        ),
        ({}, None),
        ({"HTTP_COOKIE": "dokerface_session="}, None),
        ({"HTTP_COOKIE": "not a valid cookie"}, None),
    ],
)
def test_extract_session_token(environ: dict[str, object], expected: str | None) -> None:
    assert extract_session_token(environ, "dokerface_session") == expected


def test_origin_must_be_explicitly_allowed() -> None:
    assert is_allowed_origin(
        {"HTTP_ORIGIN": "http://localhost:5173"},
        ["http://localhost:5173"],
    )
    assert not is_allowed_origin(
        {"HTTP_ORIGIN": "http://evil.example"},
        ["http://localhost:5173"],
    )
    assert not is_allowed_origin({}, ["http://localhost:5173"])


def test_connection_replacement_keeps_only_latest_sid() -> None:
    registry = ConnectionRegistry()

    assert registry.replace(1, "sid-old") is None
    assert registry.replace(1, "sid-new") == "sid-old"
    assert registry.sid_for_account(1) == "sid-new"
    assert registry.account_for_sid("sid-old") is None
    assert registry.account_for_sid("sid-new") == 1

    registry.release("sid-old")
    assert registry.sid_for_account(1) == "sid-new"
    assert registry.release("sid-new") == 1
    assert registry.sid_for_account(1) is None


def test_reusing_sid_moves_it_to_new_account() -> None:
    registry = ConnectionRegistry()
    registry.replace(1, "shared-sid")

    assert registry.replace(2, "shared-sid") is None
    assert registry.sid_for_account(1) is None
    assert registry.sid_for_account(2) == "shared-sid"
