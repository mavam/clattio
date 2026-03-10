export class CliError extends Error {
  readonly exitCode: number;
  readonly details?: unknown;

  constructor(message: string, options?: { details?: unknown; exitCode?: number }) {
    super(message);
    this.name = "CliError";
    this.exitCode = options?.exitCode ?? 1;
    this.details = options?.details;
  }
}

export const getExitCode = (error: unknown): number => {
  if (error && typeof error === "object" && "exitCode" in error) {
    const candidate = (error as { exitCode?: unknown }).exitCode;
    if (typeof candidate === "number") {
      return candidate;
    }
  }
  return 1;
};

export const serializeError = (error: unknown): unknown => {
  if (error instanceof CliError) {
    return error.details ?? { message: error.message };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return error ?? { message: "Unknown error" };
};
