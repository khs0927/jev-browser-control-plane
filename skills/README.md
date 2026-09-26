# Control plane skills

Each directory holds one `SKILL.md` with YAML front matter and workflow instructions. Skills describe the user goal, the runtime-selection boundary, safe authentication and approval behavior, verification, and evidence requirements. They never ask the user to run a local browser command.

- `jev-decision`: bounded typed semantic decisions using choice, noul, and score, plus the browser checkpoint rule.
- `browser-task`: general browser-task lifecycle, risk classification, and evidence.
- `research`: read-only research, comparison, and status checks.
- `authenticated-web`: secure sign-in and authenticated dashboards.
- `shopping`: price and condition comparisons with a hard purchase boundary.
- `multi-site-workflow`: connected-app plus browser-runtime workflows.

## Validation

`scripts/validate_skills.py` runs in `scripts/check.sh` and in CI. It enforces the front matter, a description of at least 20 characters, confirmation guidance in every body, and the absence of vocabulary from the project these skills were ported from.

## Provenance

These six skills were adapted from the `plugin/skills` directory of the ASIDE-GPT repository. The workflow structure, the read/write/external-effect discipline, and the credential and confirmation rules were kept. The executor names were retargeted to this control plane: `jev-ultrafast`, `browser-harness`, the existing secure bridge, `DecisionPolicy`, `JevRouter`, and `verifier.require`.

Three skills from the source were not carried over. `aside-remote` depends on a vendor contract that is not published and is therefore fail-closed. `orchestration` duplicates rules already distributed across the skills above. `gemini-web` belongs to a separate local bridge track.
