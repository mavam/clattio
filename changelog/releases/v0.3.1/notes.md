This release fixes the CLI version output so attio --version reports the released package version. The command now follows the package metadata updated during release, preventing stale version output after installation.

## 🐞 Bug fixes

### Correct CLI version output

The `attio --version` command now reports the released package version.

Version output previously came from a separate CLI constant, so the `v0.3.0` package still printed `0.2.0` after installation. The command now follows the package metadata used during release:

```sh
attio --version
```

*By @mavam and @codex.*
