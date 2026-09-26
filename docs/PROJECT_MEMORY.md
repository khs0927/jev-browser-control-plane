# Project memory — jev-browser-control-plane

Durable operating rules for this repository. Read this before changing the Jev
transport, the test setup, or anything that depends on the SDK actually running.

## 1. This repository is not ASIDE-GPT

`khs0927/jev-browser-control-plane` and `khs0927/ASIDE-GPT` are separate projects
with separate stacks. Do not carry rules, commits, or conclusions between them.

| | ASIDE-GPT | This repository |
| --- | --- | --- |
| Language | TypeScript | Python 3.12+ |
| Runner | `node --test dist/tests/*.test.js`, Node 22 | `pytest` |
| Build | `npm run ci` | `./scripts/verify_jev.sh` |
| Jev transport | OpenCode Zen Free (`jev-1.13-free`) with a TypeSafe fallback | official `typesafe-sdk` only |
| Layout | `packages/`, `plugin/skills/` | `src/jev_control_plane/`, `skills/` |

A commit hash, a test count, or a script name from one repository is not evidence
about the other. Verify against this repository before acting.

## 2. One transport: the official TypeSafe SDK

The only supported path is `typesafe-sdk` against the official TypeSafe endpoint,
with a model available to the account and `TYPESAFE_API_KEY` from the environment.

OpenCode Zen Free (`jev-1.13-free`) is **not used here**. It was considered in
`feat/aside-jev-zen-free-provider` (PR #1) and rejected. The reasoning is recorded
in `docs/JEV_DECISION.md` and in the PR #1 closure comment:

- the official SDK already owns the wire format, retry, and error taxonomy, so a
  hand-written client is a weaker duplicate, which the code ownership rule in
  `docs/ARCHITECTURE.md` forbids;
- the free model is a limited-time offer and cannot carry a production dependency;
- a second transport would mean two credential models, two failure taxonomies, and
  two places where a decision can diverge;
- a client identity that a third-party server happens to accept is not a contract.

Do not reintroduce it without a decision record. `scripts/validate_skills.py` also
fails any skill that reintroduces the source project's vocabulary, which is a
cheap regression guard for this rule.

## 3. Verify against the real SDK with `scripts/verify_jev.sh`

```bash
./scripts/verify_jev.sh                        # SDK contract tests, offline
TYPESAFE_API_KEY=... ./scripts/verify_jev.sh    # plus the live smoke test
```

**Do not report the Jev path as working without it.**

An agent sandbox on macOS blocks loading `pydantic_core`, the SDK's native
dependency. The failure looks like:

```
ImportError: ... code signature ... not valid for use in process:
library load disallowed by system policy
```

This is a code-signature / library-validation policy, **not** a
`com.apple.quarantine` attribute. It was reproduced on three interpreters
(3.9.6, 3.12.5, 3.13.12), so it is not version specific. It applies to processes
spawned inside the sandbox, not to a normal terminal.

The consequence: a green local test run inside a sandbox proves only that the
stubs agree with the router. It is not evidence that the SDK imports, and not
evidence that a decision can be made. Say so plainly rather than implying
otherwise.

`tests/test_sdk_contract.py` is the layer that matters here. It builds real SDK
question objects and parses real SDK answer models, and it skips when the SDK is
not importable. It exists because a stub-based suite missed a real defect:
`ScoreAnswer.score` is a `float` in the wire schema, not an `int`, and an earlier
version of the router truncated fractional scores. Always run it with the SDK
installed.

## 4. Safety rules when something will not import

- **Never** re-sign native modules with `codesign`. It was tried and it did not
  fix the library-validation failure.
- **Never** clear quarantine attributes, weaken Gatekeeper, or otherwise relax
  system security to make an import succeed. A missing or failing import is a
  result to report, not a policy to work around.
- Do not install a test runner or dependency just to make a suite run. This
  project uses `pytest`; adding `vitest` or `jest` would be wrong.

## 5. What a Jev decision is and is not

A Jev result is advisory classification evidence. It never authorizes a browser
action. `checkpoint.py` enforces this structurally: `requires_fresh_snapshot` and
`browser_action_authorized` are `init=False` on a frozen dataclass, so no caller
can construct a checkpoint claiming the action was already authorized.

Keep using `DecisionPolicy` for thresholds. A `noul` probability is not a
confidence, which is why `disposition_for_noul` exists; passing a `NoulDecision`
to `DecisionPolicy.disposition` raises on purpose.
