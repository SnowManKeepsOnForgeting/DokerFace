"""Opaque session token generation and hashing."""

import hashlib
import secrets
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SessionCredentials:
    token: str
    token_hash: str


class SessionTokenService:
    def issue(self) -> SessionCredentials:
        token = secrets.token_urlsafe(32)
        return SessionCredentials(token=token, token_hash=self.hash_token(token))

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("ascii")).hexdigest()
