---
name: multi-site-workflow
description: Use when one request needs a connected app plus one or more websites, such as receipts matched against current prices, with per-subgoal verification and a combined report.
---

# Multi-site workflow

1. Split the request into bounded subgoals and identify which source owns each fact or action.
2. Route structured work to the matching connected app first: mail, calendar, source control, documents, or another trusted app available to the operator.
3. Route general or app-inaccessible web work to the browser runtime. Do not invent a browser API or ask the user to run an external browser node.
4. Pass only the minimum necessary values between subgoals. Keep the source URL and the observation time with each value.
5. Re-classify each proposed action. A read-only first half does not make a later write or external effect safe to perform automatically.
6. Before a state-changing or consequential action, show the target, the exact change, and the expected effect, then wait for the confirmation flow when required.
7. Verify each source independently and reconcile conflicts. Return a combined report that separates observed facts, inferences, and actions actually completed.

Example: for "find the SaaS services paid last month and identify price increases", read the receipts from the connected mail app, extract service names and prior prices, inspect current pricing through the browser runtime, compare like-for-like plans, and report the sources. Do not change subscriptions or purchase anything.

Use Jev only to classify or rank the extracted records. The comparison arithmetic and the conflict resolution stay in code, and the final claim of completion comes from `verifier.require` against the observed state.
