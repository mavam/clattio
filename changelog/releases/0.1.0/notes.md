This first release of attio lets you manage Attio from the terminal with generated command coverage across Attio resources. You can inspect your workspace schema, upsert records, manage list entries, create tasks, and automate downstream integrations with webhooks without hand-writing REST calls.

## 🚀 Features

### Initial release of the Attio CLI

This first release of `attio` lets you manage Attio from the terminal instead of hand-writing REST calls. The CLI ships with generated coverage for Attio resources, token and OAuth authentication, and JSON-friendly input and output that fit well into shell scripts and automation.

You can use this release for workflows such as:

1. **Inspect your workspace schema**: Use `attio objects list` and `attio attributes list-attributes --target objects --identifier companies` before creating or updating data.
1. **Sync records from another system**: Use `attio records assert --object companies --matching-attribute domains --body-file company.json` to create or update companies, people, or custom-object records.
1. **Manage pipeline or campaign membership**: Use `attio entries assert --list sales-pipeline --body-file entry.json` to add records to lists and keep list-specific state up to date.
1. **Create follow-up work from the shell**: Use `attio tasks create --body-file task.json` to add actionable tasks to your Attio workflow.
1. **Automate downstream integrations**: Use `attio webhooks create --body-file webhook.json` to trigger external systems when Attio data changes.

*By @mavam and @codex.*
