import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { CliError } from "./errors";
import { getProfileConfig, loadConfig, updateProfileConfig } from "./config";

const execFile = promisify(execFileCallback);

type SecretKind = "clientSecret" | "token";
type SecretBackend = "config" | "keychain";

const KEYCHAIN_SERVICE = "attio-cli";

const getBackend = (env: NodeJS.ProcessEnv = process.env): SecretBackend => {
  const override = env.ATTIO_CLI_SECRET_BACKEND;
  if (override === "config" || override === "keychain") {
    return override;
  }
  return process.platform === "darwin" ? "keychain" : "config";
};

const getConfigField = (kind: SecretKind): "clientSecret" | "token" =>
  kind === "clientSecret" ? "clientSecret" : "token";

const getAccount = (profile: string, kind: SecretKind): string => `${profile}:${kind}`;

const isNotFoundError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes("The specified item could not be found") ||
    error.message.includes("could not be found in the keychain")
  );
};

const readLegacySecret = async (
  profile: string,
  kind: SecretKind,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> => {
  const config = await loadConfig(env);
  const current = getProfileConfig(config, profile);
  const value = current[getConfigField(kind)];
  return typeof value === "string" && value.trim() ? value : undefined;
};

const clearLegacySecret = async (
  profile: string,
  kind: SecretKind,
  env: NodeJS.ProcessEnv,
): Promise<void> => {
  await updateProfileConfig(
    profile,
    (current) => ({
      ...current,
      [getConfigField(kind)]: undefined,
    }),
    env,
  );
};

const setConfigSecret = async (
  profile: string,
  kind: SecretKind,
  secret: string,
  env: NodeJS.ProcessEnv,
): Promise<void> => {
  await updateProfileConfig(
    profile,
    (current) => ({
      ...current,
      [getConfigField(kind)]: secret,
    }),
    env,
  );
};

const deleteConfigSecret = async (
  profile: string,
  kind: SecretKind,
  env: NodeJS.ProcessEnv,
): Promise<void> => {
  await clearLegacySecret(profile, kind, env);
};

const findKeychainSecret = async (profile: string, kind: SecretKind): Promise<string | undefined> => {
  try {
    const { stdout } = await execFile("/usr/bin/security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      getAccount(profile, kind),
      "-w",
    ]);
    return stdout.trim();
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw new CliError("Failed to read a secret from macOS Keychain.", {
      details: error instanceof Error ? { message: error.message } : error,
      exitCode: 2,
    });
  }
};

const setKeychainSecret = async (profile: string, kind: SecretKind, secret: string): Promise<void> => {
  try {
    await execFile("/usr/bin/security", [
      "add-generic-password",
      "-U",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      getAccount(profile, kind),
      "-w",
      secret,
    ]);
  } catch (error) {
    throw new CliError("Failed to store a secret in macOS Keychain.", {
      details: error instanceof Error ? { message: error.message } : error,
      exitCode: 2,
    });
  }
};

const deleteKeychainSecret = async (profile: string, kind: SecretKind): Promise<void> => {
  try {
    await execFile("/usr/bin/security", [
      "delete-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      getAccount(profile, kind),
    ]);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw new CliError("Failed to delete a secret from macOS Keychain.", {
      details: error instanceof Error ? { message: error.message } : error,
      exitCode: 2,
    });
  }
};

const migrateLegacySecretIfNeeded = async (
  profile: string,
  kind: SecretKind,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> => {
  const legacy = await readLegacySecret(profile, kind, env);
  if (!legacy) {
    return undefined;
  }
  await setKeychainSecret(profile, kind, legacy);
  await clearLegacySecret(profile, kind, env);
  return legacy;
};

export const getStoredSecret = async (
  profile: string,
  kind: SecretKind,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> => {
  if (getBackend(env) === "config") {
    return readLegacySecret(profile, kind, env);
  }

  const keychainValue = await findKeychainSecret(profile, kind);
  if (keychainValue) {
    return keychainValue;
  }

  return migrateLegacySecretIfNeeded(profile, kind, env);
};

export const setStoredSecret = async (
  profile: string,
  kind: SecretKind,
  secret: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> => {
  if (getBackend(env) === "config") {
    await setConfigSecret(profile, kind, secret, env);
    return;
  }

  await setKeychainSecret(profile, kind, secret);
  await clearLegacySecret(profile, kind, env);
};

export const deleteStoredSecret = async (
  profile: string,
  kind: SecretKind,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> => {
  if (getBackend(env) === "config") {
    await deleteConfigSecret(profile, kind, env);
    return;
  }

  await deleteKeychainSecret(profile, kind);
  await clearLegacySecret(profile, kind, env);
};

export const hasStoredSecret = async (
  profile: string,
  kind: SecretKind,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> => Boolean(await getStoredSecret(profile, kind, env));

export const getSecretBackend = getBackend;
