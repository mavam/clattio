import type {
  MultipartFieldDescriptor,
  OperationBodyDescriptor,
  OperationManifest,
  OperationParameter,
} from "../manifest-types";

type OpenApiObject = {
  paths: Record<string, Record<string, any>>;
};

const HTTP_METHODS = new Set(["delete", "get", "patch", "post", "put"]);
const ARTICLES = new Set(["a", "an", "the"]);

const slugify = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toOptionKey = (input: string): string =>
  input
    .trim()
    .replace(/[^A-Za-z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^[A-Z]/, (char) => char.toLowerCase());

const toOptionName = (input: string): string => slugify(input).replace(/_/g, "-");

const toPascalCase = (input: string): string =>
  input
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");

const singularize = (input: string): string => {
  if (input.endsWith("ies")) {
    return `${input.slice(0, -3)}y`;
  }
  if (input.endsWith("s") && !input.endsWith("ss")) {
    return input.slice(0, -1);
  }
  return input;
};

export const synthesizeSdkFunctionName = (method: string, path: string): string => {
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith("{") && segment.endsWith("}")) {
        return `By${toPascalCase(segment.slice(1, -1))}`;
      }
      return toPascalCase(segment);
    });
  return `${method.toLowerCase()}${parts.join("")}`;
};

const normalizeParameterType = (schema: any): OperationParameter["type"] => {
  const rawType = Array.isArray(schema?.type)
    ? schema.type.find((candidate: unknown) => candidate !== "null")
    : schema?.type;

  switch (rawType) {
    case "boolean":
    case "integer":
    case "number":
      return rawType;
    default:
      return "string";
  }
};

const normalizeParameters = (pathItem: any, operation: any): OperationParameter[] =>
  [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
    .filter((parameter: any) => parameter.in === "path" || parameter.in === "query")
    .map((parameter: any) => ({
      name: parameter.name,
      optionKey: toOptionKey(parameter.name),
      optionName: toOptionName(parameter.name),
      location: parameter.in,
      required: Boolean(parameter.required),
      description: parameter.description ?? parameter.schema?.description,
      type: normalizeParameterType(parameter.schema),
    }));

const normalizeMultipartFields = (schema: any): MultipartFieldDescriptor[] => {
  const required = new Set<string>(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, property]: [string, any]) => ({
    name,
    optionKey: toOptionKey(name),
    optionName: toOptionName(name),
    required: required.has(name),
    description: property.description,
    type: property.format === "binary" ? "file" : "string",
  }));
};

const normalizeBody = (operation: any): OperationBodyDescriptor => {
  if (!operation.requestBody?.content) {
    return { kind: "none", required: false };
  }

  if (operation.requestBody.content["multipart/form-data"]) {
    return {
      kind: "multipart",
      required: Boolean(operation.requestBody.required),
      fields: normalizeMultipartFields(operation.requestBody.content["multipart/form-data"].schema),
    };
  }

  return {
    kind: "json",
    required: Boolean(operation.requestBody.required),
    description: operation.requestBody.description,
  };
};

const extractScopes = (operation: any): string[] =>
  (operation.security ?? [])
    .flatMap((entry: Record<string, string[]>) => Object.values(entry).flat())
    .filter((scope: unknown): scope is string => typeof scope === "string");

const deriveCommandGroup = (tag: string): string => slugify(tag);

const deriveBaseCommandName = (summary: string): string => slugify(summary.split(/\s+/)[0] ?? "run");

const deriveQualifier = (summary: string, _tag: string, path: string, method: string): string => {
  const parenthetical = summary.match(/\(([^)]+)\)/)?.[1];
  if (parenthetical) {
    return slugify(parenthetical);
  }

  const filtered = summary
    .split(/\s+/)
    .slice(1)
    .map((word) => slugify(word))
    .filter((word) => word && !ARTICLES.has(word));

  if (filtered.length > 0) {
    return filtered.join("-");
  }

  return slugify(`${method}-${path.replace(/[{}]/g, "")}`);
};

export const normalizeSpec = (spec: OpenApiObject): OperationManifest[] => {
  const manifests: OperationManifest[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }

      const tag = String(operation.tags?.[0] ?? "API");
      const summary = String(operation.summary ?? `${method.toUpperCase()} ${path}`);

      manifests.push({
        id: `${method.toUpperCase()} ${path}`,
        sdkFunction: synthesizeSdkFunctionName(method, path),
        tag,
        commandGroup: deriveCommandGroup(tag),
        commandName: deriveBaseCommandName(summary),
        method: method as OperationManifest["method"],
        path,
        summary,
        description: operation.description,
        parameters: normalizeParameters(pathItem, operation),
        body: normalizeBody(operation),
        scopes: extractScopes(operation),
      });
    }
  }

  const byGroupAndName = new Map<string, OperationManifest[]>();

  for (const manifest of manifests) {
    const key = `${manifest.commandGroup}:${manifest.commandName}`;
    const existing = byGroupAndName.get(key) ?? [];
    existing.push(manifest);
    byGroupAndName.set(key, existing);
  }

  for (const duplicates of byGroupAndName.values()) {
    if (duplicates.length === 1) {
      continue;
    }

    const used = new Set<string>();
    for (const manifest of duplicates) {
      const qualifier = deriveQualifier(manifest.summary, manifest.tag, manifest.path, manifest.method);
      let candidate = `${manifest.commandName}-${qualifier}`;
      let counter = 2;

      while (used.has(candidate)) {
        candidate = `${manifest.commandName}-${qualifier}-${counter}`;
        counter += 1;
      }

      manifest.commandName = candidate;
      used.add(candidate);
    }
  }

  manifests.sort((left, right) => {
    const leftKey = `${left.commandGroup}:${left.commandName}`;
    const rightKey = `${right.commandGroup}:${right.commandName}`;
    return leftKey.localeCompare(rightKey);
  });

  return manifests;
};
