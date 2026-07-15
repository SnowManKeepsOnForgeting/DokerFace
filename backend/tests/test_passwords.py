from app.auth.passwords import PasswordService


def test_password_service_hashes_and_verifies_passwords() -> None:
    service = PasswordService()
    password = "correct horse battery staple"

    password_hash = service.hash(password)

    assert password_hash != password
    assert password_hash.startswith("$argon2")
    assert service.verify(password, password_hash)
    assert not service.verify("wrong password", password_hash)
