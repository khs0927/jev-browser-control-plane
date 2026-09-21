from __future__ import annotations

import hashlib
import json
import os
import secrets
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class BrowserBridgeError(RuntimeError):
    pass


class BrowserBridge:
    """Client for the existing secure Windows browser bridge.

    Concurrency, OAuth validation, unsafe-tool denial, and mutation replay
    protection stay in the bridge. This client never blindly retries writes.
    """

    def __init__(self, base_url: str | None = None, timeout: float = 180.0) -> None:
        self.base_url = (
            base_url
            or os.environ.get("BROWSER_BRIDGE_LOCAL")
            or "http://127.0.0.1:3011"
        ).rstrip("/")
        self.timeout = timeout

    def _json(
        self,
        path: str,
        *,
        method: str = "GET",
        body: dict[str, Any] | None = None,
    ) -> Any:
        payload = None
        headers = {"accept": "application/json"}
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["content-type"] = "application/json"

        request = Request(
            f"{self.base_url}{path}",
            data=payload,
            headers=headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise BrowserBridgeError(f"bridge HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise BrowserBridgeError(f"bridge unavailable: {exc.reason}") from exc

    def health(self) -> dict[str, Any]:
        return dict(self._json("/health"))

    def tools(self) -> Any:
        return self._json("/tools")

    def call(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
        *,
        scope: str | None = None,
        mutation_id: str | None = None,
    ) -> Any:
        body: dict[str, Any] = {
            "name": name,
            "arguments": arguments or {},
        }
        if scope:
            body["scope"] = scope
        if mutation_id:
            body["mutationId"] = mutation_id
        return self._json("/call", method="POST", body=body)

    @staticmethod
    def mutation_id(goal: str, step: str, nonce: str | None = None) -> str:
        token = nonce or secrets.token_hex(16)
        raw = f"{goal}\0{step}\0{token}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()
