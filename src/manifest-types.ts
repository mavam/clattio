export type HttpMethod = "delete" | "get" | "patch" | "post" | "put";

export type ParameterType = "boolean" | "integer" | "number" | "string";

export interface OperationParameter {
  name: string;
  optionKey: string;
  optionName: string;
  location: "path" | "query";
  required: boolean;
  description?: string;
  type: ParameterType;
}

export interface JsonBodyDescriptor {
  kind: "json";
  required: boolean;
  description?: string;
}

export interface MultipartFieldDescriptor {
  name: string;
  optionKey: string;
  optionName: string;
  required: boolean;
  description?: string;
  type: "file" | "string";
}

export interface MultipartBodyDescriptor {
  kind: "multipart";
  required: boolean;
  fields: MultipartFieldDescriptor[];
}

export interface NoBodyDescriptor {
  kind: "none";
  required: false;
}

export type OperationBodyDescriptor =
  | JsonBodyDescriptor
  | MultipartBodyDescriptor
  | NoBodyDescriptor;

export interface OperationManifest {
  id: string;
  sdkFunction: string;
  tag: string;
  commandGroup: string;
  commandName: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  parameters: OperationParameter[];
  body: OperationBodyDescriptor;
  scopes: string[];
}
