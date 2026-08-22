"""Server-side encryption for platform SMTP credentials."""

from base64 import urlsafe_b64encode
from hashlib import sha256

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings


class PlatformEmailSecretError(Exception):
    """Raised when a platform email credential cannot be safely used."""


def encrypt_platform_email_secret(value: str, settings: Settings) -> str:
    return _get_fernet(settings).encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_platform_email_secret(value: str, settings: Settings) -> str:
    try:
        return _get_fernet(settings).decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise PlatformEmailSecretError("Platform email credential cannot be decrypted.") from exc


def _get_fernet(settings: Settings) -> Fernet:
    key = settings.platform_email_encryption_key
    if not key or len(key) < 32:
        raise PlatformEmailSecretError("Platform email encryption is not configured.")
    # Deriving a Fernet key permits secret-manager values without requiring the admin to
    # manufacture Fernet-specific base64 text. The source value is never persisted or returned.
    derived_key = urlsafe_b64encode(sha256(key.encode("utf-8")).digest())
    return Fernet(derived_key)
