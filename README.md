# 🚀 clattio

A command-line interface for managing Attio from your terminal.

This exists to fill a gap in the current MCP workflow: the MCP can read Attio well, but it cannot perform object writes. This CLI fixes that by exposing Attio's API as shell commands you can use directly or automate in scripts.

Use it to:

- create, update, and inspect Attio objects, records, lists, entries, and integration resources such as files, webhooks, and SCIM users
- perform Attio write operations that are blocked through the MCP path
- script Attio workflows with raw JSON output
- manage Attio from the shell without hand-writing REST calls

## ⚙️ Setup

```sh
bun install
bun run generate
bun run build
bun run test
```

## ▶️ Run

Run the built CLI directly:

```sh
bun run build
node dist/attio.js --help
node dist/attio.js objects list
```

Run it without a build during development:

```sh
bun src/bin/attio.ts --help
bun src/bin/attio.ts objects list
```

Install the published package globally:

```sh
npm install -g clattio
attio --help
```

Install it as a global command from this checkout:

```sh
bun link
attio --help
```

## 🔐 Authenticate

Use an API token:

```sh
attio auth token set
attio objects list
```

Or use the built-in OAuth flow:

```sh
export ATTIO_CLIENT_ID=...
attio auth login
```

When `ATTIO_CLIENT_SECRET` is not set, the CLI prompts for it securely instead of accepting it on the command line.
On macOS, stored OAuth secrets and tokens use Keychain by default.

## 🧭 Attio OAuth Setup

`attio auth login` can open the browser, handle the localhost callback, exchange the authorization code, and store the resulting token. It still requires an Attio OAuth app first.

Get the OAuth credentials from the Attio developer dashboard:

1. Go to `https://build.attio.com`
2. Create an app
3. Open the app settings
4. Find the OAuth settings
5. Copy the `client_id` and `client_secret`
6. Register `http://127.0.0.1:8787/callback` as a redirect URI for the CLI callback

## 🔗 Attio Docs

Relevant Attio docs:

- `https://docs.attio.com/docs/oauth/authorize`
- `https://docs.attio.com/docs/oauth/token`
- `https://docs.attio.com/rest-api/tutorials/connect-an-app-through-oauth`
