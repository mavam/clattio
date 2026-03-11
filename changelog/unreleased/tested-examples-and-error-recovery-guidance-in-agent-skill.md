---
title: Tested examples and error-recovery guidance in agent skill
type: change
authors:
  - mavam
  - claude
created: 2026-03-11T19:38:27.421746Z
---

The agent skill now includes tested, copy-pasteable examples for the
body-driven commands that most commonly cause failures: `records search`,
`records list-records`, and `entries list-entries`. A new cross-cutting
section flags which read commands require a JSON body despite looking like
simple list operations. The error-handling guidance now directs the agent to
consult these per-command examples after the first validation error instead
of guessing body shapes. A new "find a record and check list membership"
workflow captures the most common end-to-end pattern — searching for a
record, checking its list memberships, and deciding whether to add it.
