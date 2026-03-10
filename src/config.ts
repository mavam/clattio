import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ProfileConfig {
  token?: string;
  tokenType?: "api-token" | "oauth";
  clientId?: string;
  clientSecret?: string;
  updatedAt?: string;
}

export interface AppConfig {
  currentProfile?: string;
  profiles: Record<string, ProfileConfig>;
}

const DEFAULT_CONFIG: AppConfig = {
  currentProfile: "default",
  profiles: {},
};

export const getConfigDir = (env: NodeJS.ProcessEnv = process.env): string => {
  if (env.XDG_CONFIG_HOME) {
    return path.join(env.XDG_CONFIG_HOME, "attio-cli");
  }
  if (process.platform === "win32" && env.APPDATA) {
    return path.join(env.APPDATA, "attio-cli");
  }
  return path.join(os.homedir(), ".config", "attio-cli");
};

export const getConfigPath = (env: NodeJS.ProcessEnv = process.env): string =>
  path.join(getConfigDir(env), "config.json");

export const loadConfig = async (env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> => {
  try {
    const raw = await readFile(getConfigPath(env), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      currentProfile: parsed.currentProfile ?? "default",
      profiles: parsed.profiles ?? {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(DEFAULT_CONFIG);
    }
    throw error;
  }
};

export const saveConfig = async (
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> => {
  const configDir = getConfigDir(env);
  const configPath = getConfigPath(env);
  const tempPath = `${configPath}.tmp`;

  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await rm(tempPath, { force: true });
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(tempPath, 0o600);
  await rename(tempPath, configPath);
};

export const getProfileConfig = (config: AppConfig, profileName: string): ProfileConfig =>
  config.profiles[profileName] ?? {};

export const updateProfileConfig = async (
  profileName: string,
  updater: (profile: ProfileConfig) => ProfileConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProfileConfig> => {
  const config = await loadConfig(env);
  const nextProfile = updater(getProfileConfig(config, profileName));

  config.currentProfile = profileName;
  config.profiles[profileName] = nextProfile;

  await saveConfig(config, env);
  return nextProfile;
};
