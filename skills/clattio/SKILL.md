---
name: clattio
description: Guides the agent through Attio CLI (`attio`) workflows — querying, creating, updating, and managing CRM data from the terminal. Use this skill whenever the user wants to work with Attio through the `attio` CLI or the `clattio` npm package. Trigger for requests to inspect or modify Attio objects, attributes, records, lists, entries, notes, comments, tasks, meetings, call recordings, transcripts, files, webhooks, workspace members, or SCIM resources. Also use when the user mentions Attio contacts, companies, people, lists, pipelines, CRM data, syncing data into Attio, or automating Attio workflows from scripts. Even if the user doesn't mention Attio by name but refers to CRM records, contacts, pipelines, or deal stages in a context where Attio is the workspace CRM, use this skill.
---

# clattio

Use this skill to translate user requests into safe, practical `attio` CLI workflows.

## Start with the Attio data model

Map the user's request to the right resource type before you run commands:

- **Object**: a record type such as people, companies, or a custom object.
- **Attribute**: a field on an object or list.
- **Record**: one actual company, person, deal, or custom-object item.
- **List**: a curated collection or workflow bucket for records.
- **Entry**: one record's membership inside a list, with list-specific fields.
- **Note / comment / thread / task**: collaboration objects around records or entries.
- **Meeting / call recording / transcript**: synced activity and conversation data.
- **File**: uploaded or linked file/folder content on records.
- **Webhook / SCIM / workspace member / meta**: integration and administration surfaces, including limited SCIM provisioning.

If a user says "contact," "company," "deal," or "CRM item," they usually mean a **record**.
If they say "pipeline," "queue," "segment," or "saved collection," they often mean a **list** plus **entries**.
If they say "field," "dropdown," "status," or "schema," they mean **attributes** or **objects**.

For the full command map with per-group "when to use" guidance and practical advice, read [`references/api-surface.md`](references/api-surface.md).

## When in doubt, check `--help`

The CLI is generated from an OpenAPI spec and has many flags. When you are unsure about exact flag names, required arguments, or body shapes, run:

```sh
attio <group> <command> --help
```

This is the fastest way to avoid hallucinated flags and malformed requests.

## Default workflow

1. Check authentication first with `attio auth status` if the session state is unclear.
   - If the user has never authenticated, guide them through setup:
     - **API token**: `attio auth token set` then paste the token.
     - **OAuth**: set `ATTIO_CLIENT_ID`, optionally `ATTIO_CLIENT_SECRET`, then `attio auth login`.
   - If `attio auth status` returns an error, fix auth before doing anything else.
2. Discover the schema before writing:
   - `attio objects list`
   - `attio objects get --object ...`
   - `attio attributes list-attributes --target objects --identifier ...`
   - `attio lists list`
   - `attio lists get --list ...`
3. Prefer exact IDs or slugs from live reads over guessing names.
4. For writes, prefer `--body-file` with a temp JSON file instead of long inline JSON.
5. After a write, read the resource back to confirm the result.

## Command selection heuristics

### Prefer `assert` for idempotent sync jobs

Use `records assert` or `entries assert` when the user wants "create or update," "upsert," "sync," or "make sure this exists."

Use `create` only when duplicates should fail loudly.

See the Records and Entries sections in [`references/api-surface.md`](references/api-surface.md) for the full create/assert/update command set and body patterns.

### Choose the right multiselect update mode

- Use `update-append-multiselect-values` when you want to add tags/options without removing existing ones.
- Use `update-overwrite-multiselect-values` when the payload should become the full source of truth.

### Search vs list

- Use `records search` for fuzzy lookup across names, domains, emails, phone numbers, and labels.
- Use `records list-records` when you already know the object and want deterministic pagination.
- Use `entries list-entries` when you care about list membership rather than global object records.

## Practical execution tips

- The write endpoints usually expect JSON inside a top-level `data` object.
- For records and entries, values are typically maps keyed by attribute slug or ID, and the values are arrays.
- Use `--profile <name>` for multiple workspaces or environments.
- Use `--token <token>` for one-off overrides without changing stored auth.
- Use `--verbose` when you need request metadata while debugging.

## Handling errors

When a command fails, read the error message before retrying:

- **401 Unauthorized**: the token is missing, expired, or lacks the required scope. Run `attio auth status` and, if needed, re-authenticate.
- **404 Not Found**: the slug, ID, or resource path is wrong. Re-discover with `attio objects list`, `attio lists list`, or `attio <group> --help` to verify the correct identifiers.
- **422 Unprocessable Entity**: the request body is malformed. Check the attribute types and value shapes against `attio attributes list-attributes` and `attio <group> <command> --help`. Common mistakes include missing the outer `data` wrapper and passing a bare value instead of an array.
- **429 Too Many Requests**: back off and retry after a short delay.

Do not retry blindly - diagnose first, fix the input, then retry.

## Pagination

List endpoints return a page of results at a time. Pass `--offset` and `--limit` to paginate through large result sets. Keep fetching with an increasing offset until the response returns fewer items than the limit.

## Safe patterns

### Create JSON bodies in files

Prefer a temp file like this:

```sh
cat > /tmp/record.json <<'EOF'
{
  "data": {
    "values": {
      "name": [{"value": "Acme"}]
    }
  }
}
EOF
attio records create --object companies --body-file /tmp/record.json
```

If you do not know the correct value shape for an attribute, inspect the object and attribute definitions first, then check `attio <group> <command> --help`. The "Body patterns you can reuse" section in [`references/api-surface.md`](references/api-surface.md) documents common body shapes for each resource type.

### Verify after writes

After mutating data, follow up with one of:

- `attio records get ...`
- `attio entries get ...`
- `attio objects get ...`
- `attio lists get ...`
- `attio tasks get ...`
- `attio webhooks get ...`

## Common workflows

### Set up a new custom object

1. Create the object with `attio objects create`.
2. Add fields with `attio attributes create-attribute`.
3. If needed, add dropdown options or statuses.
4. Start creating records in that object.

### Sync people or companies from another system

1. Discover the object slug and unique matching attribute.
2. Use `attio records assert --object ... --matching-attribute ...`.
3. Read the record back or search for it.

### Manage a pipeline or campaign list

1. Create or inspect the list.
2. Add list-specific attributes if needed.
3. Use `attio entries assert` or `attio entries create` to add records.
4. Update entry statuses or tags with the entry update commands.

### Add collaboration context

- Use `notes` for durable record notes.
- Use `comments` and `threads` for conversational discussion.
- Use `tasks` for actionable follow-up with assignees and deadlines.

For workflows involving meetings, call recordings, transcripts, files, webhooks, SCIM, or workspace members, read the corresponding section in [`references/api-surface.md`](references/api-surface.md) before acting — those resources have their own command sets and body shapes that are not covered above.
