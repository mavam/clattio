---
title: Current Attio API surface
type: change
authors:
  - mavam
  - codex
prs:
  - 1
created: 2026-06-16T10:05:40.290215Z
---

The CLI now tracks the current Attio API surface and dependency stack.

The generated command set has been refreshed from Attio’s latest OpenAPI specification. SCIM commands are no longer exposed because they are absent from the current spec, and file listing is now documented as record-scoped:

```sh
attio files list --object companies --record-id <id>
```

The bundled agent skill and README examples have been updated to match the current commands, including body-driven record search:

```sh
attio records search --body '{"query":"Jane","objects":["people"],"request_as":{"type":"workspace"}}'
```
