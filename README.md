# 🚀 clattio

A command-line interface for managing [Attio](https://attio.com) from your terminal.

Create, update, and inspect Attio objects, records, lists, entries, notes, tasks, webhooks, and more without hand-writing REST calls.

## 🏁 Get started

Grab an API token from your [Attio workspace settings](https://app.attio.com), then:

```sh
npx clattio auth token set
npx clattio objects list
npx clattio records search --object people --query "Jane"
```

For a persistent global command:

```sh
bun install -g clattio
attio objects list
```

## 🤖 Agent skill

If you use an AI coding agent that supports [skills](https://github.com/anthropics/skills), you can install clattio as a skill:

```sh
npx skills add mavam/clattio
```

This gives your agent the knowledge to drive the `attio` CLI on your behalf, from querying records to managing lists, creating notes, and more.

## 🔐 Authenticate

**API token** (recommended for scripts and quick usage):

```sh
attio auth token set
```

**OAuth** (for apps that act on behalf of a user):

```sh
export ATTIO_CLIENT_ID=...
attio auth login
```

When `ATTIO_CLIENT_SECRET` is not set, the CLI prompts for it securely.
On macOS, tokens and secrets are stored in Keychain by default.

## 🧭 OAuth setup

`attio auth login` opens the browser, handles the localhost callback, exchanges the authorization code, and stores the resulting token. You need an Attio OAuth app first:

1. Go to [build.attio.com](https://build.attio.com) and create an app.
2. In the app settings, find the OAuth section.
3. Copy the `client_id` and `client_secret`.
4. Register `http://127.0.0.1:8787/callback` as a redirect URI.

## ▶️ Run locally

From a source checkout:

```sh
bun src/bin/attio.ts --help
bun src/bin/attio.ts objects list
```

Or build first and run with Node:

```sh
bun run build
node dist/attio.js objects list
```

## ⚙️ Develop

```sh
bun install
bun run generate
bun run build
bun run test
```

## 🔗 Attio docs

- [OAuth authorization](https://docs.attio.com/docs/oauth/authorize)
- [OAuth token exchange](https://docs.attio.com/docs/oauth/token)
- [Connect an app through OAuth](https://docs.attio.com/rest-api/tutorials/connect-an-app-through-oauth)
