This release keeps canonical Attio CLI commands stable as the generated API surface grows, while adding saved-view commands and upsert terminology from the latest Attio specification. It also improves the bundled agent skill with tested examples and clearer recovery guidance for body-driven commands.

## 🔧 Changes

### Tested examples and error-recovery guidance in agent skill

The agent skill now includes tested, copy-pasteable examples for the body-driven commands that most commonly cause failures: `records search`, `records list-records`, and `entries list-entries`. A new cross-cutting section flags which read commands require a JSON body despite looking like simple list operations. The error-handling guidance now directs the agent to consult these per-command examples after the first validation error instead of guessing body shapes. A new "find a record and check list membership" workflow captures the most common end-to-end pattern — searching for a record, checking its list memberships, and deciding whether to add it.

*By @mavam and @claude.*

## 🐞 Bug fixes

### Stable generated CLI commands

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

*By @mavam and @codex.*
