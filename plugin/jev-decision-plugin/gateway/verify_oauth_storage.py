"""Opt-in synthetic OAuth store check after an approved backend is provisioned.

No actual OAuth tokens, no TypeSafe requests, and no output of secrets.
"""
import asyncio
import secrets
from oauth_storage import persistent_oauth_storage


async def check():
    signing, first = persistent_oauth_storage()
    name = "check-" + secrets.token_hex(12)
    fixture = {"synthetic": secrets.token_urlsafe(24)}
    try:
        await first.put(key=name, value=fixture, collection="store-check", ttl=60)
        again_signing, second = persistent_oauth_storage()
        if signing != again_signing:
            raise RuntimeError("Signing key was not stable")
        if await second.get(key=name, collection="store-check") != fixture:
            raise RuntimeError("Persistent storage reconstruction failed")
        value, remaining = await second.ttl(key=name, collection="store-check")
        if value != fixture or remaining is None or not (0 < remaining <= 60):
            raise RuntimeError("Expiry/TTL roundtrip failed")
    finally:
        # Delete only the one short-lived synthetic check item.
        await first.delete(key=name, collection="store-check")
    print("OAUTH_STORAGE_SYNTHETIC_RESTART_TEST_OK")


if __name__ == "__main__":
    asyncio.run(check())
