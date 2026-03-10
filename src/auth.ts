import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { URL } from "node:url";

import { CliError } from "./errors";
import {
  getConfigPath,
  getProfileConfig,
  loadConfig,
  updateProfileConfig,
} from "./config";
import type { PromptFn } from "./prompts";
import {
  deleteStoredSecret,
  getSecretBackend,
  getStoredSecret,
  hasStoredSecret,
  setStoredSecret,
} from "./secrets";

const DEFAULT_BASE_URL = "https://api.attio.com";
export const DEFAULT_OAUTH_PORT = 8787;
const AUTHORIZE_URL = "https://app.attio.com/authorize";
const TOKEN_URL = "https://app.attio.com/oauth/token";

const normalizeOptionalString = (
  value: string | undefined,
): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export interface AuthStatus {
  profile: string;
  configPath: string;
  tokenSource: "config" | "env" | "flag" | "none";
  hasEnvToken: boolean;
  hasStoredToken: boolean;
  hasStoredClientSecret: boolean;
  hasEffectiveToken: boolean;
  baseUrl: string;
  secretBackend: "config" | "keychain";
}

export interface ResolvedAuth {
  profile: string;
  baseUrl: string;
  configPath: string;
  token?: string;
  tokenSource: AuthStatus["tokenSource"];
}

export interface ResolveAuthOptions {
  env?: NodeJS.ProcessEnv;
  profile: string;
  tokenOverride?: string;
  baseUrlOverride?: string;
}

export interface LoginOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  openBrowser?: (url: string) => Promise<void>;
  profile: string;
  clientId?: string;
  port?: number;
  promptText?: PromptFn;
  promptSecret?: PromptFn;
  stderr?: NodeJS.WritableStream;
}

export const resolveAuth = async ({
  env = process.env,
  profile,
  tokenOverride,
  baseUrlOverride,
}: ResolveAuthOptions): Promise<ResolvedAuth> => {
  const config = await loadConfig(env);
  const profileConfig = getProfileConfig(config, profile);
  const envToken = normalizeOptionalString(env.ATTIO_TOKEN);
  const storedToken = await getStoredSecret(profile, "token", env);

  const token = tokenOverride ?? envToken ?? storedToken;
  const tokenSource: AuthStatus["tokenSource"] = tokenOverride
    ? "flag"
    : envToken
      ? "env"
      : storedToken
        ? "config"
        : "none";

  return {
    profile,
    baseUrl: baseUrlOverride ?? env.ATTIO_BASE_URL ?? DEFAULT_BASE_URL,
    configPath: getConfigPath(env),
    token,
    tokenSource,
  };
};

export const getAuthStatus = async (
  profile: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AuthStatus> => {
  const config = await loadConfig(env);
  const envToken = normalizeOptionalString(env.ATTIO_TOKEN);
  const storedToken = await hasStoredSecret(profile, "token", env);
  const storedClientSecret = await hasStoredSecret(
    profile,
    "clientSecret",
    env,
  );

  return {
    profile,
    configPath: getConfigPath(env),
    tokenSource: envToken ? "env" : storedToken ? "config" : "none",
    hasEnvToken: Boolean(envToken),
    hasStoredToken: storedToken,
    hasStoredClientSecret: storedClientSecret,
    hasEffectiveToken: Boolean(envToken) || storedToken,
    baseUrl: env.ATTIO_BASE_URL ?? DEFAULT_BASE_URL,
    secretBackend: getSecretBackend(env),
  };
};

export const setApiToken = async (
  profile: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> => {
  if (!token.trim()) {
    throw new CliError("Token cannot be empty.");
  }

  await setStoredSecret(profile, "token", token.trim(), env);
  const secretBackend = getSecretBackend(env);
  await updateProfileConfig(
    profile,
    (current) => ({
      ...current,
      token: secretBackend === "config" ? token.trim() : undefined,
      tokenType: "api-token",
      updatedAt: new Date().toISOString(),
    }),
    env,
  );
};

export const clearStoredToken = async (
  profile: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> => {
  await deleteStoredSecret(profile, "token", env);
  const secretBackend = getSecretBackend(env);
  await updateProfileConfig(
    profile,
    (current) => ({
      ...current,
      token: secretBackend === "config" ? undefined : current.token,
      tokenType: undefined,
      updatedAt: new Date().toISOString(),
    }),
    env,
  );
};

const spawnDetached = async (
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2] = {},
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      ...options,
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });

const openBrowserWithSystemDefault = async (url: string): Promise<void> => {
  if (process.platform === "darwin") {
    await spawnDetached("open", [url]);
    return;
  }
  if (process.platform === "win32") {
    await spawnDetached("cmd", ["/c", "start", "", url], {
      windowsHide: true,
    });
    return;
  }
  await spawnDetached("xdg-open", [url]);
};

const startCallbackServer = async (
  port: number | undefined,
  expectedState: string,
): Promise<{ redirectUri: string; waitForCode: Promise<string> }> =>
  new Promise((resolve, reject) => {
    let settled = false;
    let resolver: ((code: string) => void) | undefined;
    let rejecter: ((error: unknown) => void) | undefined;

    const waitForCode = new Promise<string>((innerResolve, innerReject) => {
      resolver = innerResolve;
      rejecter = innerReject;
    });

    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      response.statusCode = 200;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");

      if (error) {
        response.end(`Attio OAuth error: ${error}\n`);
        server.close();
        rejecter?.(new CliError(`Attio OAuth error: ${error}`));
        return;
      }

      if (!code || !state || state !== expectedState) {
        response.end("The callback was missing a valid authorization code.\n");
        server.close();
        rejecter?.(
          new CliError(
            "The OAuth callback was missing a valid authorization code.",
          ),
        );
        return;
      }

      response.end("Attio authentication complete. You can close this tab.\n");
      server.close();
      resolver?.(code);
    });

    const timeout = setTimeout(() => {
      server.close();
      rejecter?.(
        new CliError("Timed out waiting for the OAuth callback.", {
          exitCode: 2,
        }),
      );
    }, 120_000);

    server.on("close", () => clearTimeout(timeout));
    server.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
        return;
      }
      rejecter?.(error);
    });

    server.listen(port ?? 0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const redirectUri = `http://127.0.0.1:${address.port}/callback`;
      settled = true;
      resolve({ redirectUri, waitForCode });
    });
  });

const resolveOauthCredentials = async (
  profile: string,
  env: NodeJS.ProcessEnv,
  explicitClientId?: string,
  promptTextFn?: PromptFn,
  promptSecretFn?: PromptFn,
): Promise<{ clientId: string; clientSecret: string }> => {
  const config = await loadConfig(env);
  const profileConfig = getProfileConfig(config, profile);
  const storedClientSecret = await getStoredSecret(
    profile,
    "clientSecret",
    env,
  );

  let clientId =
    normalizeOptionalString(explicitClientId) ??
    normalizeOptionalString(env.ATTIO_CLIENT_ID) ??
    profileConfig.clientId;
  let clientSecret =
    normalizeOptionalString(env.ATTIO_CLIENT_SECRET) ?? storedClientSecret;

  if (!clientId && promptTextFn) {
    clientId = normalizeOptionalString(
      await promptTextFn("Attio OAuth client ID: "),
    );
  }

  if (!clientSecret && promptSecretFn) {
    clientSecret = normalizeOptionalString(
      await promptSecretFn("Attio OAuth client secret: "),
    );
  }

  if (!clientId || !clientSecret) {
    throw new CliError(
      "OAuth login requires a client ID and client secret. Set ATTIO_CLIENT_ID / ATTIO_CLIENT_SECRET or enter them interactively.",
      { exitCode: 2 },
    );
  }

  return { clientId, clientSecret };
};

export const loginWithOAuth = async ({
  env = process.env,
  fetchImpl = fetch,
  openBrowser = openBrowserWithSystemDefault,
  profile,
  clientId: explicitClientId,
  port,
  promptText: promptTextFn,
  promptSecret: promptSecretFn,
  stderr = process.stderr,
}: LoginOptions): Promise<{ profile: string; tokenType: "oauth" }> => {
  const { clientId, clientSecret } = await resolveOauthCredentials(
    profile,
    env,
    explicitClientId,
    promptTextFn,
    promptSecretFn,
  );

  const state = randomBytes(24).toString("hex");
  const redirectPort = port ?? DEFAULT_OAUTH_PORT;
  const { redirectUri, waitForCode } = await startCallbackServer(
    redirectPort,
    state,
  );

  const callbackResult = waitForCode.then(async (code) => {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const payload = (await response.json()) as {
      access_token?: string;
      token_type?: string;
      error?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw new CliError("Failed to exchange the OAuth authorization code.", {
        details: payload,
        exitCode: 2,
      });
    }

    await updateProfileConfig(
      profile,
      (current) => ({
        ...current,
        clientId,
        clientSecret:
          getSecretBackend(env) === "config" ? clientSecret : undefined,
        token:
          getSecretBackend(env) === "config" ? payload.access_token : undefined,
        tokenType: "oauth",
        updatedAt: new Date().toISOString(),
      }),
      env,
    );
    await setStoredSecret(profile, "clientSecret", clientSecret, env);
    await setStoredSecret(profile, "token", payload.access_token, env);

    return { redirectUri };
  });

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  try {
    await openBrowser(authorizeUrl.toString());
  } catch {
    stderr.write(`Open this URL in your browser:\n${authorizeUrl}\n`);
  }

  stderr.write(`Waiting for OAuth callback on ${redirectUri}\n`);
  await callbackResult;

  return {
    profile,
    tokenType: "oauth",
  };
};
