"""Persistent encrypted FastMCP OAuth token/client storage.

External Redis is required; missing configuration fails closed, never falling
back to an ephemeral local disk or process memory.
"""
from __future__ import annotations

import os
from urllib.parse import urlsplit

from cryptography.fernet import Fernet


class OAuthStorageConfigurationError(RuntimeError):
    """Configuration failure without sensitive environment values."""


def persistent_oauth_storage():
    """Return stable JWT key and encrypted Redis AsyncKeyValue storage.

    Required sensitive environment variables:
      JEV_OAUTH_REDIS_URL: credentialed rediss:// remote Redis database
      JEV_OAUTH_FERNET_KEY: Fernet.generate_key(), retained across deploys
      JEV_OAUTH_JWT_SIGNING_KEY: separate, stable 32+ character secret
    """
    required = ("JEV_OAUTH_REDIS_URL", "JEV_OAUTH_FERNET_KEY",
                "JEV_OAUTH_JWT_SIGNING_KEY")
    if any(not os.getenv(name) for name in required):
        raise OAuthStorageConfigurationError("Persistent OAuth storage is not fully configured")
    url = os.environ["JEV_OAUTH_REDIS_URL"]
    try:
        parsed = urlsplit(url)
        port = parsed.port
        db = parsed.path.lstrip("/") or "0"
        if (
            parsed.scheme != "rediss" or not parsed.hostname
            or parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}
            or not port or not (1 <= port <= 65535)
            or not parsed.password or parsed.query or parsed.fragment
            or not db.isdecimal() or len(db) > 3
        ):
            raise ValueError("Invalid transport")
    except (ValueError, AttributeError):
        raise OAuthStorageConfigurationError(
            "Redis must use credentialed, remote TLS rediss:// URL"
        ) from None

    signing_key = os.environ["JEV_OAUTH_JWT_SIGNING_KEY"]
    if len(signing_key) < 32 or signing_key.isspace():
        raise OAuthStorageConfigurationError(
            "OAuth JWT signing key must be at least 32 characters"
        )
    try:
        fernet = Fernet(os.environ["JEV_OAUTH_FERNET_KEY"].encode("ascii"))
    except (ValueError, TypeError, UnicodeEncodeError):
        raise OAuthStorageConfigurationError("Invalid Fernet encryption key") from None

    try:
        from redis.asyncio import Redis
        from key_value.aio.stores.redis import RedisStore
        from key_value.aio.wrappers.encryption import FernetEncryptionWrapper
        from key_value.aio.wrappers.prefix_collections import PrefixCollectionsWrapper
    except ImportError:
        raise OAuthStorageConfigurationError(
            "Encrypted Redis dependencies unavailable"
        ) from None

    try:
        # Explicit certificate and hostname verification; no insecure override.
        client = Redis.from_url(
            url, ssl_cert_reqs="required", ssl_check_hostname=True,
            socket_connect_timeout=5, socket_timeout=5,
            decode_responses=True,
        )
        namespaced = PrefixCollectionsWrapper(
            key_value=RedisStore(client=client), prefix="jev-oauth-v1"
        )
        store = FernetEncryptionWrapper(
            key_value=namespaced, fernet=fernet,
            raise_on_decryption_error=True,
        )
    except Exception:
        # Third-party exception text may contain a credentialed Redis URL.
        raise OAuthStorageConfigurationError(
            "Cannot configure encrypted Redis backend"
        ) from None
    return signing_key, store
