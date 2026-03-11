# clattio API surface guide

This reference maps the full `attio` CLI surface to practical use cases.

## Table of contents

- [Core mental model](#core-mental-model)
- [Cross-cutting guidance](#cross-cutting-guidance)
- [Objects](#objects)
- [Attributes](#attributes)
- [Records](#records)
- [Lists](#lists)
- [Entries](#entries)
- [Notes](#notes)
- [Comments and threads](#comments-and-threads)
- [Tasks](#tasks)
- [Meetings](#meetings)
- [Call recordings](#call-recordings)
- [Transcripts](#transcripts)
- [Files](#files)
- [Webhooks](#webhooks)
- [Meta](#meta)
- [Workspace members](#workspace-members)
- [SCIM](#scim)

## Core mental model

Use these rules before choosing a command:

- **Objects** define record types.
- **Attributes** define fields on objects or lists.
- **Records** are actual entities inside an object.
- **Lists** are containers or workflow views over records.
- **Entries** are a record's row inside a list.
- **Notes, comments, threads, and tasks** are collaboration layers.
- **Meetings, call recordings, and transcripts** capture activity data.
- **Files** attach folders and files to records.
- **Webhooks, workspace members, SCIM, and meta** cover integrations and administration.

## Cross-cutting guidance

### Read-first discovery flow

When the workspace structure is not already known, start with:

```sh
attio auth status
attio objects list
attio lists list
```

Then narrow down with:

```sh
attio objects get --object <object>
attio attributes list-attributes --target objects --identifier <object>
attio lists get --list <list>
attio attributes list-attributes --target lists --identifier <list>
```

### Body patterns you can reuse

Most write endpoints expect a top-level `data` object.

Common patterns:

- **Object create**: `data.api_slug`, `data.singular_noun`, `data.plural_noun`
- **Attribute create**: `data.title`, `data.api_slug`, `data.type`, `data.config`, and validation flags such as `is_required`
- **Record write**: `data.values`
- **List create**: `data.name`, `data.api_slug`, `data.parent_object`, and access settings
- **Entry write**: `data.parent_record_id`, `data.parent_object`, `data.entry_values`
- **Task create**: `data.content`, `data.format`, `data.deadline_at`, `data.linked_records`, `data.assignees`
- **Webhook create**: `data.target_url`, `data.subscriptions`

For records and entries, the values object is keyed by attribute slug or ID, and the values are arrays.

### Create vs assert vs update

- Use **create** when duplicates should fail.
- Use **assert** when you want idempotent create-or-update behavior.
- Use **append multiselect** updates when adding values.
- Use **overwrite multiselect** updates when replacing values.

## Objects

Use `objects` when the user wants to define or inspect a record type.

Typical use cases:

- Create a custom object such as deals, vendors, projects, or partners.
- Inspect an object before creating records in it.
- Rename or adjust object metadata.

Commands:

- `attio objects list` — list all standard and custom objects.
- `attio objects get --object <object>` — inspect one object by slug or ID.
- `attio objects create --body-file <json>` — create a custom object.
- `attio objects update --object <object> --body-file <json>` — rename or re-slug an object.

Practical advice:

- Create the object first, then add attributes, then create records.
- If the user only wants to store data inside existing people or companies, you probably do not need `objects create`.

## Attributes

Use `attributes` when the user wants to change schema on an object or list.

Typical use cases:

- Add a new field such as industry, lead source, lifecycle stage, or renewal date.
- Add dropdown options to a select field.
- Add or rename statuses in a workflow list.
- Create relationships between objects with record-reference attributes.

Commands:

- `attio attributes list-attributes --target <objects|lists> --identifier <id>` — inspect fields on an object or list.
- `attio attributes get --target <objects|lists> --identifier <id> --attribute <attr>` — inspect one field.
- `attio attributes create-attribute --target <objects|lists> --identifier <id> --body-file <json>` — add a field.
- `attio attributes update-attribute --target <objects|lists> --identifier <id> --attribute <attr> --body-file <json>` — change field metadata.
- `attio attributes list-select-options --target ... --identifier ... --attribute ...` — inspect dropdown options.
- `attio attributes create-select-option --target ... --identifier ... --attribute ... --body-file <json>` — add a dropdown choice.
- `attio attributes update-select-option --target ... --identifier ... --attribute ... --option ... --body-file <json>` — rename or adjust a dropdown choice.
- `attio attributes list-statuses --target ... --identifier ... --attribute ...` — inspect status values.
- `attio attributes create-status --target ... --identifier ... --attribute ... --body-file <json>` — add a status.
- `attio attributes update-status --target ... --identifier ... --attribute ... --status ... --body-file <json>` — rename or adjust a status.

Practical advice:

- For schema work, read the existing object or list first so you do not duplicate slugs.
- For record-reference attributes, think about whether the user wants a one-way link or a bidirectional relationship.
- Status fields are list-oriented workflow tools; standard people and company objects do not support status attributes.

## Records

Use `records` for actual CRM entities inside an object.

Typical use cases:

- Create or upsert people, companies, deals, or custom-object items.
- Search for a contact or company by name, domain, email, or phone.
- Inspect one record and its current field values.
- Update tags or other multiselect attributes.
- Delete a mistaken or duplicate record.

Commands:

- `attio records list-records --object <object>` — browse records in one object.
- `attio records search --body-file <json>` — fuzzy search across one or more objects.
- `attio records get --object <object> --record-id <id>` — fetch one record.
- `attio records create --object <object> --body-file <json>` — create a new record and fail on uniqueness conflicts.
- `attio records assert --object <object> --matching-attribute <attr> --body-file <json>` — idempotent create-or-update by a unique field.
- `attio records update-append-multiselect-values --object <object> --record-id <id> --body-file <json>` — add multiselect values without deleting existing ones.
- `attio records update-overwrite-multiselect-values --object <object> --record-id <id> --body-file <json>` — replace existing values with the payload.
- `attio records list-record-attribute-values --object <object> --record-id <id> --attribute <attr>` — inspect one attribute's values on a record.
- `attio records list-record-entries --object <object> --record-id <id>` — see which lists a record belongs to.
- `attio records delete --object <object> --record-id <id>` — delete a record.

Practical advice:

- Prefer `assert` for imports and syncs from other systems.
- Prefer `create` for strict data entry when duplicates should raise an error.
- `search` is convenient but eventually consistent; use direct gets or list endpoints when freshness matters.
- Read back the record after a write if you need the canonical Attio value representation.

## Lists

Use `lists` when the user wants to manage a named collection or workflow.

Typical use cases:

- Create a pipeline or campaign list.
- Inspect the allowed parent object for a list.
- Update list name or access controls.

Commands:

- `attio lists list` — list all lists.
- `attio lists get --list <list>` — inspect one list.
- `attio lists create --body-file <json>` — create a new list.
- `attio lists update --list <list> --body-file <json>` — rename a list or change access.

Practical advice:

- New lists must declare `parent_object`, which controls which record type can be added.
- Lists can be workspace-wide or restricted to specific workspace members.
- After creating a list, add list-specific attributes and then start managing entries.

## Entries

Use `entries` for a record's membership inside a specific list.

Typical use cases:

- Add a company or person to a list.
- Upsert one list membership by parent record.
- Update list-specific fields such as stage, owner, or campaign status.
- Inspect the list-side values for an entry.

Commands:

- `attio entries list-entries --list <list>` — browse entries in a list.
- `attio entries get --list <list> --entry-id <id>` — inspect one list entry.
- `attio entries create --list <list> --body-file <json>` — add a record to a list as a new entry.
- `attio entries assert --list <list> --body-file <json>` — ensure one parent record has an entry and update it if it already exists.
- `attio entries update-append-multiselect-values --list <list> --entry-id <id> --body-file <json>` — add multiselect values on the entry.
- `attio entries update-overwrite-multiselect-values --list <list> --entry-id <id> --body-file <json>` — replace multiselect values on the entry.
- `attio entries list-attribute-values-for-list-entry --list <list> --entry-id <id> --attribute <attr>` — inspect one entry field.
- `attio entries delete --list <list> --entry-id <id>` — remove a record from a list.

Practical advice:

- Use `assert` when the parent record should have at most one logical membership in that list.
- Use `create` when duplicate entries are acceptable.
- Entry attributes are distinct from parent record attributes; choose the endpoint based on where the data belongs.

## Notes

Use `notes` for durable note content attached to records.

Typical use cases:

- Add meeting notes or research notes to a record.
- Fetch a specific note.
- List notes for one record or across the workspace.

Commands:

- `attio notes list` — list notes, optionally filtered.
- `attio notes get --note-id <id>` — fetch one note.
- `attio notes create --body-file <json>` — create a note on a record.
- `attio notes delete --note-id <id>` — delete a note.

Practical advice:

- Prefer notes for durable long-form context that should live with the record.
- If the user wants back-and-forth discussion rather than a standalone note, use comments and threads instead.

## Comments and threads

Use `comments` and `threads` for conversational discussion on records or list entries.

Typical use cases:

- Add a comment to a record or entry.
- Inspect existing comment threads.
- Retrieve the full thread before posting a follow-up.

Commands:

- `attio threads list` — list comment threads for a record or list entry.
- `attio threads get --thread-id <id>` — fetch all comments in one thread.
- `attio comments create --body-file <json>` — post a comment to a thread, record, or entry.
- `attio comments get --comment-id <id>` — fetch one comment.
- `attio comments delete --comment-id <id>` — delete a comment.

Practical advice:

- Use `threads list` before commenting when you need to continue an existing conversation instead of starting a new one.
- Use comments for conversational collaboration; use notes for stable reference content.

## Tasks

Use `tasks` for follow-up work with deadlines and assignees.

Typical use cases:

- Create a follow-up task tied to one or more records.
- Mark a task complete.
- Reassign a task or move its deadline.
- List open or recent tasks.

Commands:

- `attio tasks list` — browse tasks.
- `attio tasks get --task-id <id>` — inspect one task.
- `attio tasks create --body-file <json>` — create a task.
- `attio tasks update --task-id <id> --body-file <json>` — update deadline, completion state, linked records, or assignees.
- `attio tasks delete --task-id <id>` — delete a task.

Practical advice:

- Task content currently supports plaintext only.
- Assignees can be specified by workspace-member actor ID or by email address.
- When the user asks for a reminder or follow-up, tasks are usually the right surface.

## Meetings

Use `meetings` to sync or inspect meetings.

Typical use cases:

- Mirror external meeting systems into Attio.
- Retrieve a meeting and its metadata.
- List meetings in the workspace.

Commands:

- `attio meetings list` — list meetings.
- `attio meetings get --meeting-id <id>` — inspect one meeting.
- `attio meetings find --body-file <json>` — find or create a meeting idempotently.

Practical advice:

- `find` is the main sync entry point when importing meetings from another system.
- If the user also cares about recordings or transcripts, continue into the call-recordings and transcripts groups.

## Call recordings

Use `call-recordings` for recording assets attached to meetings.

Typical use cases:

- Attach a recording after syncing a meeting.
- Inspect a recording.
- Remove an incorrect recording.

Commands:

- `attio call-recordings list --meeting-id <id>` — list recordings for a meeting.
- `attio call-recordings get --meeting-id <id> --call-recording-id <id>` — fetch one recording.
- `attio call-recordings create --meeting-id <id> --body-file <json>` — create a recording for a meeting.
- `attio call-recordings delete --meeting-id <id> --call-recording-id <id>` — delete a recording.

Practical advice:

- Create is rate limited to one request per second.
- These endpoints are newer and may change earlier than the core record/list surfaces.

## Transcripts

Use `transcripts` when the user wants the text of a call recording.

Typical use cases:

- Fetch transcript text for summarization.
- Pull paginated transcript segments.

Commands:

- `attio transcripts get --meeting-id <id> --call-recording-id <id>` — fetch a transcript, optionally with a cursor.

Practical advice:

- You usually need the meeting ID and call recording ID first.
- This surface is read-only in the CLI.

## Files

Use `files` for file and folder content attached to records.

Typical use cases:

- Upload a file to a record.
- Create a folder on a record.
- Browse or download existing files.
- Delete a file that was uploaded by mistake.

Commands:

- `attio files list` — list files.
- `attio files get --file-id <id>` — inspect one file.
- `attio files download --file-id <id>` — download file contents.
- `attio files upload --file <path> --object <object> --record-id <id> [--parent-folder-id <id>]` — upload a file to Attio storage.
- `attio files create --body-file <json>` — create a folder entry or connected file/folder entry.
- `attio files delete --file-id <id>` — delete a file.

Practical advice:

- `upload` expects multipart form data with a binary field named `file`, plus body fields such as `object` and `record_id`.
- Maximum upload size is 50 MB.
- When you are unsure how the CLI wants file uploads expressed, run `attio files upload --help` before acting.

## Webhooks

Use `webhooks` for outbound event subscriptions.

Typical use cases:

- Send record, list, task, note, or comment events to an external service.
- Inspect existing subscriptions.
- Update a webhook target or subscriptions.
- Remove an obsolete integration.

Commands:

- `attio webhooks list` — list webhooks.
- `attio webhooks get --webhook-id <id>` — inspect one webhook.
- `attio webhooks create --body-file <json>` — create a webhook and its subscriptions.
- `attio webhooks update --webhook-id <id> --body-file <json>` — change target URL or subscriptions.
- `attio webhooks delete --webhook-id <id>` — delete a webhook.

Practical advice:

- The creation response includes the signing secret; capture it immediately.
- Subscription filters can use `$and` or `$or` rules with simple equality comparisons.
- Use webhooks when the user wants Attio to push changes out, not when they want one-time export or polling.

## Meta

Use `meta identify` to understand the current token context.

Typical use cases:

- Confirm which workspace a token belongs to.
- Confirm available scopes before attempting an action.
- Debug authentication problems.

Commands:

- `attio meta identify` — show token identity, workspace, and permissions.

## Workspace members

Use `workspace-members` for Attio user lookup.

Typical use cases:

- Find assignees for tasks.
- Inspect one workspace member.
- Audit workspace membership.

Commands:

- `attio workspace-members list` — list all workspace members.
- `attio workspace-members get --workspace-member-id <id>` — fetch one workspace member.

Practical advice:

- This is often the supporting step before creating or updating tasks.

## SCIM

Use the `scim-*` groups for identity-management and provisioning surfaces.

Typical use cases:

- Inspect SCIM users and groups.
- Create a SCIM user when provisioning needs to start from the CLI surface.
- Learn which SCIM schemas the service supports.
- Troubleshoot enterprise identity sync.

Commands:

- `attio scim-users create` — create a SCIM user.
- `attio scim-users list` — list SCIM users.
- `attio scim-groups list` — list SCIM groups.
- `attio scim-schemas list` — list supported SCIM schemas.

Practical advice:

- These commands are still primarily administrative. The only write currently exposed here is `scim-users create`.
- Check `attio scim-users create --help` before acting. The generated surface currently exposes no body or flags for this endpoint, so treat it as spec-driven and verify the live behavior before relying on it in an automation flow.
- If the user is not explicitly asking about provisioning or identity sync, they probably do not need the SCIM commands.
