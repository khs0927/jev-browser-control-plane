# Jev Browser Control Plane

Thin integration around Jev System One and existing browser runtimes. The project now exposes a native decision provider for Aside instead of wrapping Jev as an OpenAI-compatible chat proxy.

## V1 provider path

```text
Aside
  -> MCP: jev_step / jev_system_one
  -> bounded candidate + confidence gate
  -> OpenCode Zen System One
  -> jev-1.13-free
```

The default backend is OpenCode Zen Free. It calls `https://opencode.ai/zen/v1/systemone` with model `jev-1.13-free` and the project's own `x-opencode-client` identity. It does not impersonate OpenCode or OpenChamber. If Zen rejects this client identity, the request fails closed.

Set a stable client id for your deployment:

```bash
export JEV_PROVIDER=zen-free
export JEV_ZEN_CLIENT_ID=jev-browser-control-plane
```

To explicitly use a TypeSafe account instead:

```bash
export JEV_PROVIDER=typesafe
export TYPESAFE_API_KEY=...
```

There is no automatic fallback from the free backend to a paid backend.

## Aside MCP

Install the package and start the stdio server:

```bash
pip install -e .
jevctl-mcp
```

The MCP exposes:

- `jev_provider_status`: active backend/model without secrets.
- `jev_system_one`: raw Choice/Score/Noul request.
- `jev_choose`: choose one caller-owned candidate, without execution.
- `jev_step`: choose + validate + confidence gate + return the original execution payload.

### Account-scoped automatic registration

The setup command follows the same account-scoped pattern used by current Aside/Jev integrations: it only merges one MCP server entry and manages the selected account's `AGENTS.md` block and `skills/user/aside-jev/SKILL.md`.

Preview first:

```bash
jevctl aside-setup --profile "/absolute/path/to/Aside/accountRoot"
```

Apply explicitly with Aside closed:

```bash
jevctl aside-setup --profile "/absolute/path/to/Aside/accountRoot" --apply
```

It preserves unrelated settings/MCP entries, backs up changed existing files, and refuses to overwrite an unrelated `jev-control-plane` MCP entry or an unowned `aside-jev` skill. Reopen Aside and start a **new task** after applying.

This makes Jev automatic through account instructions + MCP when those instructions are active. It is not a runtime hook that can technically intercept every built-in Aside browser action.

Use `skills/aside-jev/SKILL.md` as the repository copy of the task instruction.

## Safety contract

- Jev never invents browser selectors, input values, URLs or tool arguments.
- Candidates come from the caller and an `abstain` candidate is always available.
- The default `jev_step` threshold is 0.70; lower-confidence actions become `abstain`.
- The caller must re-observe after page changes; old candidates are not reusable.
- Jev decisions do not replace user approval for destructive or sensitive side effects.
- A model completion decision is not proof; outcome verification remains independent.

## Existing browser stack

The repository still reuses the existing secure browser bridge and browser runtimes rather than reimplementing DOM extraction or CDP. The bridge retains authentication, serialized browser writes and replay protection.

See `docs/ARCHITECTURE.md` and `THIRD_PARTY.md`.

## Local checks

Use Python 3.12 or newer.

```bash
python -m compileall -q src tests
pytest -q
PYTHONPATH=src python -m jev_control_plane.cli bridge-health
PYTHONPATH=src python -m jev_control_plane.cli bridge-tools
```
