"""Password hashing and verification backed by pwdlib's Argon2 configuration."""

from pwdlib import PasswordHash


class PasswordService:
    def __init__(self) -> None:
        self._password_hash = PasswordHash.recommended()

    def hash(self, password: str) -> str:
        return self._password_hash.hash(password)

    def verify(self, password: str, password_hash: str) -> bool:
        return self._password_hash.verify(password, password_hash)
