"""In-memory one-connection-per-account registry."""


class ConnectionRegistry:
    def __init__(self) -> None:
        self._account_to_sid: dict[int, str] = {}
        self._sid_to_account: dict[str, int] = {}

    def replace(self, account_id: int, sid: str) -> str | None:
        """Register a connection and return the previous SID for the account."""

        previous_sid = self._account_to_sid.get(account_id)
        if previous_sid == sid:
            return None
        if previous_sid is not None:
            self._sid_to_account.pop(previous_sid, None)

        previous_account_id = self._sid_to_account.get(sid)
        if previous_account_id is not None and previous_account_id != account_id:
            self._account_to_sid.pop(previous_account_id, None)

        self._account_to_sid[account_id] = sid
        self._sid_to_account[sid] = account_id
        return previous_sid

    def release(self, sid: str) -> int | None:
        """Release a SID without removing a newer replacement connection."""

        account_id = self._sid_to_account.pop(sid, None)
        if account_id is None:
            return None
        if self._account_to_sid.get(account_id) == sid:
            self._account_to_sid.pop(account_id, None)
        return account_id

    def sid_for_account(self, account_id: int) -> str | None:
        return self._account_to_sid.get(account_id)

    def account_for_sid(self, sid: str) -> int | None:
        return self._sid_to_account.get(sid)


__all__ = ["ConnectionRegistry"]
