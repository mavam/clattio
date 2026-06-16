---
title: Correct CLI version output
type: bugfix
authors:
  - mavam
  - codex
created: 2026-06-16T10:45:57.494023Z
---

The `attio --version` command now reports the released package version.

Version output previously came from a separate CLI constant, so the `v0.3.0` package still printed `0.2.0` after installation. The command now follows the package metadata used during release:

```sh
attio --version
```
