import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

const loadLoginWithOAuth = async () => {
  vi.resetModules();
  vi.doMock("node:child_process", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:child_process")>();
    return {
      ...actual,
      spawn: spawnMock,
    };
  });
  return (await import("../src/auth")).loginWithOAuth;
};

const waitForMatch = async (
  getOutput: () => string,
  pattern: RegExp,
  timeoutMs = 2_000,
): Promise<RegExpMatchArray> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const match = getOutput().match(pattern);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for output matching ${pattern}.`);
};

describe("loginWithOAuth", () => {
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    spawnMock.mockReset();
    env = {
      ...process.env,
      ATTIO_CLI_SECRET_BACKEND: "config",
      XDG_CONFIG_HOME: await mkdtemp(
        path.join(os.tmpdir(), "attio-auth-test-"),
      ),
    };
  });

  it("falls back to printing the authorization URL when the browser launcher is missing", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = vi.fn();
      process.nextTick(() => {
        const error = Object.assign(new Error("spawn ENOENT"), {
          code: "ENOENT",
        });
        child.emit("error", error);
      });
      return child;
    });

    const loginWithOAuth = await loadLoginWithOAuth();

    const stderr = new PassThrough();
    let stderrOutput = "";
    stderr.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = new URLSearchParams(String(init?.body ?? ""));
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

    const loginPromise = loginWithOAuth({
      env,
      fetchImpl: fetchMock as unknown as typeof fetch,
      profile: "default",
      promptText: async () => "client-id",
      promptSecret: async () => "client-secret",
      stderr,
    });

    const match = await waitForMatch(
      () => stderrOutput,
      /Open this URL in your browser:\n([^\n]+)/,
    );

    const authorizeUrl = new URL(match[1]);
    const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
    const state = authorizeUrl.searchParams.get("state");

    expect(redirectUri).toBe("http://127.0.0.1:8787/callback");
    expect(state).toBeTruthy();

    const callbackUrl = new URL(redirectUri!);
    callbackUrl.searchParams.set("code", "oauth-code");
    callbackUrl.searchParams.set("state", state!);
    await fetch(callbackUrl);

    await expect(loginPromise).resolves.toEqual({
      profile: "default",
      tokenType: "oauth",
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(stderrOutput).toContain("Open this URL in your browser:");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
