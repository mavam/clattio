---
title: Initial release of the Attio CLI
type: feature
authors:
  - mavam
  - codex
created: 2026-03-11T18:17:41.903944Z
---

This first release of `attio` lets you manage Attio from the terminal instead of hand-writing REST calls. The CLI ships with generated coverage for Attio resources, token and OAuth authentication, and JSON-friendly input and output that fit well into shell scripts and automation.

You can use this release for workflows such as:

1. **Inspect your workspace schema**: Use `attio objects list` and `attio attributes list-attributes --target objects --identifier companies` before creating or updating data.
2. **Sync records from another system**: Use `attio records assert --object companies --matching-attribute domains --body-file company.json` to create or update companies, people, or custom-object records.
3. **Manage pipeline or campaign membership**: Use `attio entries assert --list sales-pipeline --body-file entry.json` to add records to lists and keep list-specific state up to date.
4. **Create follow-up work from the shell**: Use `attio tasks create --body-file task.json` to add actionable tasks to your Attio workflow.
5. **Automate downstream integrations**: Use `attio webhooks create --body-file webhook.json` to trigger external systems when Attio data changes.
