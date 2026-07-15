"""Helpers for authenticating browser Socket.IO connections."""

from collections.abc import Collection, Mapping
from http.cookies import CookieError, SimpleCookie


def extract_session_token(
    environ: Mapping[str, object],
    cookie_name: str,
) -> str | None:
    """Read one session cookie from the ASGI/Engine.IO environment."""

    raw_cookie = environ.get("HTTP_COOKIE")
    if not isinstance(raw_cookie, str) or not raw_cookie:
        return None
    cookies = SimpleCookie()
    try:
        cookies.load(raw_cookie)
    except CookieError:
        return None
    morsel = cookies.get(cookie_name)
    if morsel is None or not morsel.value:
        return None
    return morsel.value


def is_allowed_origin(
    environ: Mapping[str, object],
    allowed_origins: Collection[str],
) -> bool:
    """Require a browser Origin header that is explicitly configured."""

    origin = environ.get("HTTP_ORIGIN")
    return isinstance(origin, str) and origin in allowed_origins


__all__ = ["extract_session_token", "is_allowed_origin"]
