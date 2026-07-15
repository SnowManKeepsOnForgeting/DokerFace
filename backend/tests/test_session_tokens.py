from app.auth.session_tokens import SessionTokenService


def test_session_token_service_issues_verifiable_opaque_tokens() -> None:
    service = SessionTokenService()

    first = service.issue()
    second = service.issue()

    assert first.token
    assert first.token != first.token_hash
    assert first.token != second.token
    assert len(first.token_hash) == 64
    assert service.hash_token(first.token) == first.token_hash
