import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../src/cli";

const streamToString = async (stream: PassThrough): Promise<string> => {
  stream.end();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
};

describe("runCli", () => {
  let stdout: PassThrough;
  let stderr: PassThrough;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    stdout = new PassThrough();
    stderr = new PassThrough();
    env = {
      ...process.env,
      ATTIO_TOKEN: "test-token",
      ATTIO_CLI_SECRET_BACKEND: "config",
      XDG_CONFIG_HOME: await mkdtemp(path.join(os.tmpdir(), "attio-cli-test-")),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes generated commands and prints JSON", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      expect(url).toBe("https://api.attio.com/v2/objects");
      return new Response(JSON.stringify({ data: [{ api_slug: "people" }] }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      });
    });

    const exitCode = await runCli(["objects", "list"], {
      env,
      fetch: fetchMock as unknown as typeof fetch,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await streamToString(stdout)).toContain('"api_slug": "people"');
    expect(await streamToString(stderr)).toBe("");
  });

  it("stores API tokens in the selected profile", async () => {
    const exitCode = await runCli(
      ["--profile", "work", "auth", "token", "set"],
      {
        env,
        promptSecret: async () => "abc123",
        stdout,
        stderr,
      },
    );

    expect(exitCode).toBe(0);
    const statusStdout = new PassThrough();
    const statusStderr = new PassThrough();

    const statusExitCode = await runCli(
      ["--profile", "work", "auth", "status"],
      {
        env: {
          ...env,
          ATTIO_TOKEN: "",
        },
        stdout: statusStdout,
        stderr: statusStderr,
      },
    );

    expect(statusExitCode).toBe(0);
    expect(await streamToString(statusStdout)).toContain(
      '"hasStoredToken": true',
    );
    expect(await streamToString(statusStderr)).toBe("");
  });

  it("prompts for OAuth credentials and stores the token", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        expect(url).toBe("https://app.attio.com/oauth/token");

        const body = new URLSearchParams(String(init?.body ?? ""));
        expect(body.get("grant_type")).toBe("authorization_code");
        expect(body.get("code")).toBe("oauth-code");
        expect(body.get("redirect_uri")).toBe("http://127.0.0.1:8787/callback");

        return new Response(
          JSON.stringify({
            access_token: "oauth-token",
            token_type: "Bearer",
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        );
      },
    );

    const openBrowser = vi.fn(async (url: string) => {
      const authorizeUrl = new URL(url);
      const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
      const state = authorizeUrl.searchParams.get("state");

      expect(redirectUri).toBe("http://127.0.0.1:8787/callback");
      expect(state).toBeTruthy();

      const callbackUrl = new URL(redirectUri!);
      callbackUrl.searchParams.set("code", "oauth-code");
      callbackUrl.searchParams.set("state", state!);
      await fetch(callbackUrl);
    });

    const exitCode = await runCli(["--profile", "oauth", "auth", "login"], {
      env: {
        ...env,
        ATTIO_TOKEN: "",
      },
      fetch: fetchMock as unknown as typeof fetch,
      openBrowser,
      promptText: async () => "client-id",
      promptSecret: async () => "client-secret",
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(openBrowser).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await streamToString(stdout)).toContain('"tokenType": "oauth"');
    expect(await streamToString(stderr)).toContain(
      "http://127.0.0.1:8787/callback",
    );
  });

  it("rejects malformed integer query parameters", async () => {
    const fetchMock = vi.fn();

    const exitCode = await runCli(
      [
        "attributes",
        "list-attributes",
        "--target",
        "objects",
        "--identifier",
        "people",
        "--limit",
        "10foo",
      ],
      {
        env,
        fetch: fetchMock as unknown as typeof fetch,
        stdout,
        stderr,
      },
    );

    expect(exitCode).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(await streamToString(stderr))).toMatchObject({
      message: 'Expected an integer, received "10foo".',
    });
  });

  it("rejects malformed OAuth port values", async () => {
    const fetchMock = vi.fn();

    const exitCode = await runCli(["auth", "login", "--port", "8787abc"], {
      env: {
        ...env,
        ATTIO_TOKEN: "",
      },
      fetch: fetchMock as unknown as typeof fetch,
      promptText: async () => "client-id",
      promptSecret: async () => "client-secret",
      stdout,
      stderr,
    });

    expect(exitCode).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(await streamToString(stderr))).toMatchObject({
      message: 'Expected an integer, received "8787abc".',
    });
  });
});
