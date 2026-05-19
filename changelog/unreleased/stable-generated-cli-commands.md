---
title: Stable generated CLI commands
type: bugfix
authors:
  - mavam
  - codex
created: 2026-05-19T19:54:13.195229Z
---

The generated CLI keeps stable short list commands while exposing new Attio API operations from the latest specification.

For example, canonical resource commands continue to work:

```sh
attio objects list
attio attributes list --target objects --identifier companies
```

New saved-view endpoints are available as explicit commands such as:

```sh
attio objects list-views-for-object --object companies
attio lists list-views-for-list --list sales_pipeline
```

Create-or-update workflows now use the Attio API terminology:

```sh
attio records upsert --object companies --matching-attribute domains --body-file company.json
attio entries upsert --list sales_pipeline --body-file entry.json
```
