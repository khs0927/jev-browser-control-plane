from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ZEN_JEV_API_URL = "https://opencode.ai/zen/v1/systemone"
ZEN_JEV_MODEL = "jev-1.13-free"
DEFAULT_CLIENT_ID = "jev-browser-control-plane"
DEFAULT_USER_AGENT = "JevBrowserControlPlane/0.2.0 (+https://github.com/khs0927/jev-browser-control-plane)"


class JevProviderError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "unavailable",
        status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class ProviderStatus:
    source: str
    model: str
    endpoint: str
    client_id: str | None
    credential_required: bool
    credential_configured: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "model": self.model,
            "endpoint": self.endpoint,
            "client_id": self.client_id,
            "credential_required": self.credential_required,
            "credential_configured": self.credential_configured,
        }


def _validate_question_shape(questions: Mapping[str, Any]) -> None:
    if not isinstance(questions, Mapping) or not 1 <= len(questions) <= 32:
        raise ValueError("questions must contain 1 to 32 named questions")
    for name, question in questions.items():
        if not isinstance(name, str) or not name.strip() or len(name) > 128:
            raise ValueError("question names must contain 1 to 128 characters")
        if not isinstance(question, Mapping):
            raise ValueError("questions must use raw System One question objects")
        qtype = str(question.get("type") or question.get("kind") or "").lower()
        if qtype not in {"choice", "score", "noul", "boolean", "bool"}:
            raise ValueError("question type must be choice, score, or noul")


class ZenFreeProvider:
    """OpenCode Zen System One transport for the versioned free Jev model.

    This does not impersonate OpenCode or OpenChamber. The caller identifies
    itself through its own x-opencode-client value so Zen can apply its policy.
    """

    source = "zen-free"

    def __init__(
        self,
        *,
        endpoint: str | None = None,
        model: str | None = None,
        client_id: str | None = None,
        user_agent: str | None = None,
        api_key: str | None = None,
        timeout: float = 4.0,
    ) -> None:
        self.endpoint = (
            endpoint or os.environ.get("JEV_ZEN_URL") or ZEN_JEV_API_URL
        ).rstrip("/")
        self.model = model or os.environ.get("JEV_ZEN_MODEL") or ZEN_JEV_MODEL
        self.client_id = (
            client_id
            or os.environ.get("JEV_ZEN_CLIENT_ID")
            or DEFAULT_CLIENT_ID
        ).strip()
        self.user_agent = (
            user_agent
            or os.environ.get("JEV_ZEN_USER_AGENT")
            or DEFAULT_USER_AGENT
        ).strip()
        raw_key = (
            api_key
            if api_key is not None
            else os.environ.get("OPENCODE_API_KEY")
            or os.environ.get("JEV_ZEN_API_KEY")
        )
        self.api_key = raw_key.strip() if isinstance(raw_key, str) and raw_key.strip() else None
        self.timeout = timeout
        if not self.client_id:
            raise ValueError("JEV_ZEN_CLIENT_ID must not be empty")
        if not self.user_agent:
            raise ValueError("JEV_ZEN_USER_AGENT must not be empty")

    def status(self) -> ProviderStatus:
        return ProviderStatus(
            source=self.source,
            model=self.model,
            endpoint=self.endpoint,
            client_id=self.client_id,
            credential_required=False,
            credential_configured=bool(self.api_key and self.api_key.lower() != "zen"),
        )

    def system_one(
        self,
        *,
        state: Any,
        questions: Mapping[str, Any],
        model: str | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        _validate_question_shape(questions)
        payload = json.dumps(
            {
                "state": state,
                "questions": dict(questions),
                "model": model or self.model,
            },
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "user-agent": self.user_agent,
            "x-opencode-client": self.client_id,
        }
        # Some Zen integrations use the sentinel value "zen" to select the
        # no-credential free path. Never transmit that sentinel as a bearer token.
        if self.api_key and self.api_key.lower() != "zen":
            headers["authorization"] = f"Bearer {self.api_key}"
        request = Request(
            self.endpoint,
            data=payload,
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout or self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            code = "authentication" if exc.code in (401, 403) else (
                "rate_limit" if exc.code == 429 else "http_error"
            )
            raise JevProviderError(
                f"Zen Jev responded {exc.code}: {detail}",
                code=code,
                status=exc.code,
            ) from exc
        except URLError as exc:
            raise JevProviderError(
                f"Zen Jev unavailable: {exc.reason}", code="network"
            ) from exc
        except TimeoutError as exc:
            raise JevProviderError("Zen Jev timed out", code="timeout") from exc
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            raise JevProviderError(
                "Zen Jev returned invalid JSON", code="invalid_response"
            ) from exc

        if not isinstance(body, dict) or not isinstance(body.get("answers"), dict):
            raise JevProviderError(
                "Zen Jev response has no answers", code="invalid_response"
            )
        return body


class TypeSafeProvider:
    """Official TypeSafe SDK transport. Used only when explicitly selected."""

    source = "typesafe"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str = "jev-latest",
        timeout: float = 15.0,
    ) -> None:
        key = api_key or os.environ.get("TYPESAFE_API_KEY")
        if not key:
            raise JevProviderError(
                "TYPESAFE_API_KEY is required for the typesafe backend",
                code="configuration",
            )
        from typesafe_sdk import TypeSafeClient

        self.model = model
        self.timeout = timeout
        self._client = TypeSafeClient(api_key=key, timeout=timeout)

    def status(self) -> ProviderStatus:
        return ProviderStatus(
            source=self.source,
            model=self.model,
            endpoint="https://api.typesafe.ai/v1/systemone",
            client_id=None,
            credential_required=True,
            credential_configured=True,
        )

    @staticmethod
    def _build_questions(questions: Mapping[str, Any]) -> dict[str, Any]:
        from typesafe_sdk import Choice, Noul, Score

        _validate_question_shape(questions)
        built: dict[str, Any] = {}
        for name, question in questions.items():
            qtype = str(question.get("type") or question.get("kind") or "").lower()
            instructions = question.get("instructions")
            criteria = question.get("criteria")
            if qtype == "choice":
                if not isinstance(criteria, Mapping) or not criteria:
                    raise ValueError("choice questions need criteria")
                built[name] = Choice(
                    instructions=instructions,
                    criteria=dict(criteria),
                )
            elif qtype == "score":
                if not isinstance(criteria, (list, tuple)) or len(criteria) < 2:
                    raise ValueError("score questions need ordered criteria")
                built[name] = Score(
                    instructions=instructions,
                    criteria=list(criteria),
                )
            else:
                built[name] = Noul(
                    instructions=instructions,
                    criteria=criteria,
                )
        return built

    def system_one(
        self,
        *,
        state: Any,
        questions: Mapping[str, Any],
        model: str | None = None,
        timeout: float | None = None,
    ) -> Any:
        # TypeSafeClient owns its configured timeout. Per-call timeout remains a
        # Zen-only option in this thin adapter to avoid unsafe automatic retries.
        del timeout
        return self._client.system_one(
            state=state,
            questions=self._build_questions(questions),
            model=model or self.model,
        )


def provider_from_env() -> ZenFreeProvider | TypeSafeProvider:
    mode = os.environ.get("JEV_PROVIDER", "zen-free").strip().lower()
    if mode in {"zen", "zen-free", "free"}:
        return ZenFreeProvider()
    if mode in {"typesafe", "paid"}:
        return TypeSafeProvider()
    raise JevProviderError(
        "JEV_PROVIDER must be zen-free or typesafe",
        code="configuration",
    )


def _field(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, Mapping):
        return value.get(name, default)
    return getattr(value, name, default)


def normalize_response(response: Any) -> dict[str, Any]:
    """Normalize Zen JSON and TypeSafe SDK responses to one JSON-safe shape."""

    answers = _field(response, "answers")
    if not isinstance(answers, Mapping):
        raise JevProviderError(
            "Jev response has no answer map", code="invalid_response"
        )

    normalized: dict[str, Any] = {}
    for name, answer in answers.items():
        if _field(answer, "choice") is not None:
            normalized[str(name)] = {
                "type": "choice",
                "choice": str(_field(answer, "choice")),
                "confidence": _field(answer, "confidence"),
                "probabilities": dict(_field(answer, "probabilities", {}) or {}),
            }
        elif _field(answer, "score") is not None:
            normalized[str(name)] = {
                "type": "score",
                "score": _field(answer, "score"),
                "confidence": _field(answer, "confidence"),
                "probabilities": dict(_field(answer, "probabilities", {}) or {}),
            }
        elif _field(answer, "noul") is not None:
            normalized[str(name)] = {
                "type": "noul",
                "noul": _field(answer, "noul"),
                "confidence": _field(answer, "confidence"),
                "probabilities": dict(_field(answer, "probabilities", {}) or {}),
            }
        else:
            raise JevProviderError(
                f"unsupported Jev answer for {name!r}", code="invalid_response"
            )

    usage = _field(response, "usage")
    if usage is not None and not isinstance(usage, Mapping):
        usage = {
            "input_tokens": getattr(usage, "input_tokens", None),
            "output_tokens": getattr(usage, "output_tokens", None),
        }

    return {
        "model": _field(response, "model"),
        "answers": normalized,
        "usage": usage,
    }
