import { readFile } from "node:fs/promises";
import path from "node:path";

import { CliError } from "./errors";
import type {
  MultipartBodyDescriptor,
  MultipartFieldDescriptor,
  OperationManifest,
  OperationParameter,
} from "./manifest-types";

export const writeJson = (writer: NodeJS.WritableStream, value: unknown): void => {
  writer.write(`${JSON.stringify(value, null, 2)}\n`);
};

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const parseJson = (input: string, label: string): unknown => {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new CliError(`Failed to parse ${label} as JSON.`, {
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
      exitCode: 2,
    });
  }
};

export const readJsonBody = async (body?: string, bodyFile?: string): Promise<unknown> => {
  if (body && bodyFile) {
    throw new CliError("Use either --body or --body-file, not both.", { exitCode: 2 });
  }

  if (!body && !bodyFile) {
    throw new CliError("This command requires a JSON body via --body or --body-file.", {
      exitCode: 2,
    });
  }

  if (bodyFile) {
    const raw = bodyFile === "-" ? await readStdin() : await readFile(bodyFile, "utf8");
    return parseJson(raw, bodyFile === "-" ? "stdin" : bodyFile);
  }

  if (body === "-") {
    return parseJson(await readStdin(), "stdin");
  }

  if (body?.startsWith("@")) {
    const filePath = body.slice(1);
    const raw = filePath === "-" ? await readStdin() : await readFile(filePath, "utf8");
    return parseJson(raw, filePath === "-" ? "stdin" : filePath);
  }

  return parseJson(body ?? "", "--body");
};

const readMultipartFile = async (filePath: string): Promise<File> => {
  const contents = await readFile(filePath);
  return new File([new Uint8Array(contents)], path.basename(filePath));
};

const getOptionValue = (options: Record<string, unknown>, optionKey: string): unknown =>
  options[optionKey];

const getRequiredScalar = (
  options: Record<string, unknown>,
  field: MultipartFieldDescriptor,
): string | undefined => {
  const value = getOptionValue(options, field.optionKey);
  if (value === undefined || value === null || value === "") {
    if (field.required) {
      throw new CliError(`Missing required option --${field.optionName}.`, { exitCode: 2 });
    }
    return undefined;
  }
  return String(value);
};

export const readMultipartBody = async (
  body: MultipartBodyDescriptor,
  options: Record<string, unknown>,
): Promise<Record<string, string | File>> => {
  const entries = await Promise.all(
    body.fields.map(async (field) => {
      if (field.type === "file") {
        const value = getRequiredScalar(options, field);
        if (!value) {
          return undefined;
        }
        return [field.name, await readMultipartFile(value)] as const;
      }

      const value = getRequiredScalar(options, field);
      if (value === undefined) {
        return undefined;
      }
      return [field.name, value] as const;
    }),
  );

  return Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string | File]>);
};

const coerceValue = (parameter: OperationParameter, rawValue: unknown): unknown => {
  if (rawValue === undefined) {
    return undefined;
  }
  switch (parameter.type) {
    case "boolean":
      return Boolean(rawValue);
    case "integer":
      return Number.parseInt(String(rawValue), 10);
    case "number":
      return Number.parseFloat(String(rawValue));
    case "string":
    default:
      return String(rawValue);
  }
};

export const buildOperationInput = async (
  manifest: OperationManifest,
  options: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const input: Record<string, unknown> = {};
  const pathEntries: Record<string, unknown> = {};
  const queryEntries: Record<string, unknown> = {};

  for (const parameter of manifest.parameters) {
    const value = coerceValue(parameter, options[parameter.optionKey]);
    if (value === undefined) {
      if (parameter.required) {
        throw new CliError(`Missing required option --${parameter.optionName}.`, { exitCode: 2 });
      }
      continue;
    }

    if (parameter.location === "path") {
      pathEntries[parameter.name] = value;
    } else {
      queryEntries[parameter.name] = value;
    }
  }

  if (Object.keys(pathEntries).length > 0) {
    input.path = pathEntries;
  }

  if (Object.keys(queryEntries).length > 0) {
    input.query = queryEntries;
  }

  switch (manifest.body.kind) {
    case "json":
      if (options.body !== undefined || options.bodyFile !== undefined || manifest.body.required) {
        input.body = await readJsonBody(
          options.body as string | undefined,
          options.bodyFile as string | undefined,
        );
      }
      break;
    case "multipart":
      input.body = await readMultipartBody(manifest.body, options);
      break;
    case "none":
    default:
      break;
  }

  return input;
};
