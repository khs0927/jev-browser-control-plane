"""Offline-only persistence-contract tests; do not call real Redis or TypeSafe."""
import asyncio
import sys
from types import ModuleType

import pytest
from cryptography.fernet import Fernet
from oauth_storage import OAuthStorageConfigurationError, persistent_oauth_storage


def setup(monkeypatch):
    monkeypatch.setenv("JEV_OAUTH_REDIS_URL", "rediss://owner:password@redis.example.test:6380/0")
    monkeypatch.setenv("JEV_OAUTH_FERNET_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("JEV_OAUTH_JWT_SIGNING_KEY", "synthetic-stable-signing-key-for-offline-tests")


def test_missing_storage_fails_closed(monkeypatch):
    setup(monkeypatch)
    monkeypatch.delenv("JEV_OAUTH_FERNET_KEY")
    with pytest.raises(OAuthStorageConfigurationError, match="not fully configured"):
        persistent_oauth_storage()


@pytest.mark.parametrize("url", [
    "redis://owner:password@redis.example.test:6379/0",
    "rediss://owner:password@localhost:6380/0",
    "rediss://owner:password@redis.example.test:6380/0?ssl_cert_reqs=none",
    "rediss://owner:password@redis.example.test:6380/0#fragment",
    "rediss://redis.example.test:6380/0",
    "rediss://owner:password@redis.example.test:notaport/0",
    "rediss://owner:password@redis.example.test:6380/bad",
])
def test_unsafe_redis_url_rejected_without_echo(monkeypatch, url):
    setup(monkeypatch)
    monkeypatch.setenv("JEV_OAUTH_REDIS_URL", url)
    with pytest.raises(OAuthStorageConfigurationError) as err:
        persistent_oauth_storage()
    assert "password" not in str(err.value)
    assert "redis.example.test" not in str(err.value)


def test_bad_encryption_and_signing_key_rejected(monkeypatch):
    setup(monkeypatch)
    monkeypatch.setenv("JEV_OAUTH_FERNET_KEY", "invalid")
    with pytest.raises(OAuthStorageConfigurationError, match="Fernet"):
        persistent_oauth_storage()
    setup(monkeypatch)
    monkeypatch.setenv("JEV_OAUTH_JWT_SIGNING_KEY", "short")
    with pytest.raises(OAuthStorageConfigurationError, match="signing"):
        persistent_oauth_storage()


def test_simulated_redis_persists_encrypted_refresh_token_and_ttl(monkeypatch):
    setup(monkeypatch)
    database, connection_options = {}, []
    class FakeRedis:
        @classmethod
        def from_url(cls, url, **kwargs):
            connection_options.append(kwargs)
            return cls()
    class RedisStore:
        def __init__(self, *, client):
            assert isinstance(client, FakeRedis)
        async def put(self, *, key, value, collection=None, ttl=None):
            database[(collection, key)] = (value, ttl)
        async def get(self, *, key, collection=None):
            return database.get((collection, key), (None, None))[0]
        async def ttl(self, *, key, collection=None):
            return database.get((collection, key), (None, None))
    class PrefixCollectionsWrapper:
        def __init__(self, *, key_value, prefix):
            self.base, self.prefix = key_value, prefix
        async def put(self, *, key, value, collection=None, ttl=None):
            await self.base.put(key=key, value=value, collection=f"{self.prefix}:{collection}", ttl=ttl)
        async def get(self, *, key, collection=None):
            return await self.base.get(key=key, collection=f"{self.prefix}:{collection}")
        async def ttl(self, *, key, collection=None):
            return await self.base.ttl(key=key, collection=f"{self.prefix}:{collection}")
    class FernetEncryptionWrapper:
        def __init__(self, *, key_value, fernet, raise_on_decryption_error):
            assert raise_on_decryption_error
            self.base, self.cipher = key_value, fernet
        async def put(self, *, key, value, collection=None, ttl=None):
            import json
            payload = self.cipher.encrypt(json.dumps(value).encode()).decode()
            await self.base.put(key=key, value={"ciphertext": payload}, collection=collection, ttl=ttl)
        async def get(self, *, key, collection=None):
            import json
            raw = await self.base.get(key=key, collection=collection)
            return json.loads(self.cipher.decrypt(raw["ciphertext"].encode())) if raw else None
        async def ttl(self, *, key, collection=None):
            import json
            raw, duration = await self.base.ttl(key=key, collection=collection)
            return (json.loads(self.cipher.decrypt(raw["ciphertext"].encode())) if raw else None), duration
    fake_modules = {
        "redis": {}, "redis.asyncio": {"Redis": FakeRedis},
        "key_value": {}, "key_value.aio": {}, "key_value.aio.stores": {},
        "key_value.aio.stores.redis": {"RedisStore": RedisStore},
        "key_value.aio.wrappers": {},
        "key_value.aio.wrappers.encryption": {"FernetEncryptionWrapper": FernetEncryptionWrapper},
        "key_value.aio.wrappers.prefix_collections": {"PrefixCollectionsWrapper": PrefixCollectionsWrapper},
    }
    for name, attrs in fake_modules.items():
        module = ModuleType(name)
        for key, value in attrs.items():
            setattr(module, key, value)
        monkeypatch.setitem(sys.modules, name, module)
    async def exercise():
        key, old = persistent_oauth_storage()
        token = {"refresh_token": "SYNTHETIC-SECRET-NO-LOG"}
        await old.put(key="refresh", collection="tokens", value=token, ttl=600)
        assert "SYNTHETIC-SECRET-NO-LOG" not in repr(database)
        again_key, new = persistent_oauth_storage()
        assert again_key == key
        assert await new.get(key="refresh", collection="tokens") == token
        value, ttl = await new.ttl(key="refresh", collection="tokens")
        assert value == token and ttl == 600
    asyncio.run(exercise())
    assert connection_options[0]["ssl_cert_reqs"] == "required"
    assert connection_options[0]["ssl_check_hostname"] is True


def test_fastmcp_provider_wired_to_durable_store():
    import ast
    from pathlib import Path
    code = Path(__file__).with_name("github_auth.py").read_text()
    calls = [node for node in ast.walk(ast.parse(code))
             if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
             and node.func.id == "OwnerGitHubProvider"]
    assert len(calls) == 1
    assert {"jwt_signing_key", "client_storage"}.issubset(
        {kw.arg for kw in calls[0].keywords}
    )
