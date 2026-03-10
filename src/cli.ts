import { Command, CommanderError } from "commander";

import {
  DEFAULT_OAUTH_PORT,
  clearStoredToken,
  getAuthStatus,
  loginWithOAuth,
  resolveAuth,
  setApiToken,
} from "./auth";
import { buildOperationInput, writeJson } from "./io";
import { CliError, getExitCode, serializeError } from "./errors";
import { manifest } from "./generated/manifest.gen";
import { client } from "./generated/client.gen";
import * as sdk from "./generated/sdk.gen";
import type { OperationManifest, OperationParameter } from "./manifest-types";
import { promptSecret, promptText, type PromptFn } from "./prompts";

export interface CliDependencies {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  openBrowser?: (url: string) => Promise<void>;
  promptSecret?: PromptFn;
  promptText?: PromptFn;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

interface ResolvedCliDependencies {
  env: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  openBrowser?: (url: string) => Promise<void>;
  promptSecret: PromptFn;
  promptText: PromptFn;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

const VERSION = "0.1.0";

const parseFiniteNumber = (
  value: string,
  expectedType: "integer" | "number",
): number => {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const expectedLabel = expectedType === "integer" ? "an integer" : "a number";

  if (!trimmed || !Number.isFinite(parsed)) {
    throw new CliError(`Expected ${expectedLabel}, received "${value}".`, {
      exitCode: 2,
    });
  }

  return parsed;
};

const parseInteger = (value: string): number => {
  const parsed = parseFiniteNumber(value, "integer");
  if (!Number.isInteger(parsed)) {
    throw new CliError(`Expected an integer, received "${value}".`, {
      exitCode: 2,
    });
  }
  return parsed;
};

const parseNumber = (value: string): number =>
  parseFiniteNumber(value, "number");

const getParameterParser = (
  parameter: OperationParameter,
): ((value: string) => unknown) | undefined => {
  switch (parameter.type) {
    case "integer":
      return parseInteger;
    case "number":
      return parseNumber;
    default:
      return undefined;
  }
};

const addParameterOption = (
  command: Command,
  parameter: OperationParameter,
): void => {
  const flags =
    parameter.type === "boolean"
      ? `--${parameter.optionName}`
      : `--${parameter.optionName} <value>`;

  const description =
    parameter.description ??
    `${parameter.location} parameter ${parameter.name}`;

  if (parameter.type === "boolean") {
    if (parameter.required) {
      command.requiredOption(flags, description);
    } else {
      command.option(flags, description);
    }
    return;
  }

  const parser = getParameterParser(parameter);
  if (parameter.required) {
    if (parser) {
      command.requiredOption(flags, description, parser);
    } else {
      command.requiredOption(flags, description);
    }
  } else if (parser) {
    command.option(flags, description, parser);
  } else {
    command.option(flags, description);
  }
};

const configureJsonBodyOptions = (command: Command): void => {
  command.option("--body <json>", "Inline JSON body, or @path/to/file.json");
  command.option(
    "--body-file <path>",
    "Read the request JSON body from a file or - for stdin",
  );
};

const configureMultipartBodyOptions = (
  command: Command,
  operation: OperationManifest,
): void => {
  if (operation.body.kind !== "multipart") {
    return;
  }

  for (const field of operation.body.fields) {
    const flags = `--${field.optionName} <value>`;
    const description = field.description ?? `multipart field ${field.name}`;
    if (field.required) {
      command.requiredOption(flags, description);
    } else {
      command.option(flags, description);
    }
  }
};

const configureOperationCommand = (
  command: Command,
  operation: OperationManifest,
  deps: ResolvedCliDependencies,
): void => {
  for (const parameter of operation.parameters) {
    addParameterOption(command, parameter);
  }

  if (operation.body.kind === "json") {
    configureJsonBodyOptions(command);
  } else if (operation.body.kind === "multipart") {
    configureMultipartBodyOptions(command, operation);
  }

  command.description(operation.summary);
  command.action(async (options, actionCommand) => {
    const globals = actionCommand.optsWithGlobals() as {
      baseUrl?: string;
      profile: string;
      token?: string;
      verbose?: boolean;
    };
    const auth = await resolveAuth({
      env: deps.env,
      profile: globals.profile,
      tokenOverride: globals.token,
      baseUrlOverride: globals.baseUrl,
    });

    if (!auth.token) {
      throw new CliError(
        "No Attio token is configured. Use ATTIO_TOKEN or `attio auth`.",
        {
          exitCode: 2,
        },
      );
    }

    client.setConfig({
      auth: auth.token,
      baseUrl: auth.baseUrl,
      fetch: deps.fetch ?? fetch,
      responseStyle: "data",
      throwOnError: true,
    });

    if (globals.verbose) {
      writeJson(deps.stderr, {
        authSource: auth.tokenSource,
        operation: operation.id,
        sdkFunction: operation.sdkFunction,
      });
    }

    const sdkFunction = (sdk as Record<string, unknown>)[operation.sdkFunction];
    if (typeof sdkFunction !== "function") {
      throw new CliError(
        `Generated SDK function ${operation.sdkFunction} was not found.`,
      );
    }

    const input = await buildOperationInput(
      operation,
      options as Record<string, unknown>,
    );
    const result = await (
      sdkFunction as (input: Record<string, unknown>) => Promise<unknown>
    )(input);
    writeJson(deps.stdout, result ?? null);
  });
};

const addAuthCommands = (
  program: Command,
  deps: ResolvedCliDependencies,
): void => {
  const authCommand = program
    .command("auth")
    .description("Manage Attio authentication");

  authCommand
    .command("status")
    .description("Show the current authentication status")
    .action(async (_options, command) => {
      const globals = command.optsWithGlobals() as { profile: string };
      const status = await getAuthStatus(globals.profile, deps.env);
      writeJson(deps.stdout, status);
    });

  authCommand
    .command("login")
    .description("Login using Attio OAuth")
    .option("--client-id <id>", "Attio OAuth client ID")
    .option(
      "--port <port>",
      `Redirect listener port (default: ${DEFAULT_OAUTH_PORT})`,
      parseInteger,
    )
    .action(async (options, command) => {
      const globals = command.optsWithGlobals() as { profile: string };
      const result = await loginWithOAuth({
        clientId: options.clientId as string | undefined,
        env: deps.env,
        fetchImpl: deps.fetch ?? fetch,
        openBrowser: deps.openBrowser,
        port: options.port as number | undefined,
        profile: globals.profile,
        promptSecret: deps.promptSecret,
        promptText: deps.promptText,
        stderr: deps.stderr,
      });
      writeJson(deps.stdout, result);
    });

  const tokenCommand = authCommand
    .command("token")
    .description("Manage stored API tokens");

  tokenCommand
    .command("set")
    .description(
      "Securely prompt for and store an Attio API token for the current profile",
    )
    .action(async (_options, command) => {
      const globals = command.optsWithGlobals() as { profile: string };
      const token = await deps.promptSecret("Attio API token: ");
      await setApiToken(globals.profile, token, deps.env);
      writeJson(deps.stdout, {
        profile: globals.profile,
        tokenType: "api-token",
      });
    });

  tokenCommand
    .command("clear")
    .description("Clear the stored token for the current profile")
    .action(async (_options, command) => {
      const globals = command.optsWithGlobals() as { profile: string };
      await clearStoredToken(globals.profile, deps.env);
      writeJson(deps.stdout, {
        profile: globals.profile,
        tokenCleared: true,
      });
    });

  authCommand
    .command("logout")
    .description("Alias for clearing the stored token")
    .action(async (_options, command) => {
      const globals = command.optsWithGlobals() as { profile: string };
      await clearStoredToken(globals.profile, deps.env);
      writeJson(deps.stdout, {
        profile: globals.profile,
        tokenCleared: true,
      });
    });
};

export const createProgram = (dependencies: CliDependencies = {}): Command => {
  const deps: ResolvedCliDependencies = {
    env: dependencies.env ?? process.env,
    fetch: dependencies.fetch ?? fetch,
    openBrowser: dependencies.openBrowser,
    promptSecret: dependencies.promptSecret ?? promptSecret,
    promptText: dependencies.promptText ?? promptText,
    stdout: dependencies.stdout ?? process.stdout,
    stderr: dependencies.stderr ?? process.stderr,
  };

  const program = new Command();

  program
    .name("attio")
    .description("Attio CLI generated from the Attio OpenAPI specification")
    .version(VERSION)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .option("--profile <name>", "Config profile to use", "default")
    .option("--token <token>", "Override the Attio token for this invocation")
    .option("--base-url <url>", "Override the Attio API base URL")
    .option("--verbose", "Print request metadata to stderr");

  program.configureOutput({
    writeErr: (value) => deps.stderr.write(value),
    writeOut: (value) => deps.stdout.write(value),
  });

  program.exitOverride();

  addAuthCommands(program, deps);

  const groups = new Map<string, Command>();
  for (const operation of manifest) {
    if (!groups.has(operation.commandGroup)) {
      groups.set(
        operation.commandGroup,
        program
          .command(operation.commandGroup)
          .description(`Attio ${operation.tag} operations`),
      );
    }

    const groupCommand = groups.get(operation.commandGroup)!;
    const actionCommand = groupCommand.command(operation.commandName);
    configureOperationCommand(actionCommand, operation, deps);
  }

  return program;
};

export const runCli = async (
  argv: string[],
  dependencies: CliDependencies = {},
): Promise<number> => {
  const deps: ResolvedCliDependencies = {
    env: dependencies.env ?? process.env,
    fetch: dependencies.fetch ?? fetch,
    openBrowser: dependencies.openBrowser,
    promptSecret: dependencies.promptSecret ?? promptSecret,
    promptText: dependencies.promptText ?? promptText,
    stdout: dependencies.stdout ?? process.stdout,
    stderr: dependencies.stderr ?? process.stderr,
  };

  const program = createProgram(deps);

  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code !== "commander.helpDisplayed") {
        deps.stderr.write(error.message ? `${error.message}\n` : "");
      }
      return error.exitCode;
    }

    writeJson(deps.stderr, serializeError(error));
    return getExitCode(error);
  }
};
