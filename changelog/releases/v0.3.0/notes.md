This release refreshes the generated Attio CLI against the current Attio API surface and dependency stack. It removes commands that are absent from the current specification and updates the documented workflows for record-scoped files and body-driven record search.

## 🔧 Changes

### Current Attio API surface

The CLI now tracks the current Attio API surface and dependency stack.

The generated command set has been refreshed from Attio’s latest OpenAPI specification. SCIM commands are no longer exposed because they are absent from the current spec, and file listing is now documented as record-scoped:

```sh
attio files list --object companies --record-id <id>
```

The bundled agent skill and README examples have been updated to match the current commands, including body-driven record search:

```sh
attio records search --body '{"query":"Jane","objects":["people"],"request_as":{"type":"workspace"}}'
```

*By @mavam and @codex in #1.*
