import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";

import { CliError } from "./errors";

export type PromptFn = (message: string) => Promise<string>;

const normalizePromptValue = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CliError(`${label} cannot be empty.`, { exitCode: 2 });
  }
  return trimmed;
};

export const promptText: PromptFn = async (message) => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    const answer = await rl.question(message);
    return normalizePromptValue(answer, "Value");
  } finally {
    rl.close();
  }
};

export const promptSecret: PromptFn = async (message) => {
  const input = process.stdin;
  const output = process.stderr;

  if (!input.isTTY || !output.isTTY) {
    throw new CliError("A TTY is required for secure secret entry.", { exitCode: 2 });
  }

  return new Promise<string>((resolve, reject) => {
    let secret = "";
    const restoreRawMode = input.isRaw;

    const cleanup = () => {
      input.removeListener("keypress", onKeypress);
      if (input.isTTY) {
        input.setRawMode(Boolean(restoreRawMode));
      }
      input.pause();
      output.write("\n");
    };

    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };

    const finish = () => {
      cleanup();
      try {
        resolve(normalizePromptValue(secret, "Secret"));
      } catch (error) {
        reject(error);
      }
    };

    const onKeypress = (value: string, key: { ctrl?: boolean; name?: string }) => {
      if (key.ctrl && key.name === "c") {
        fail(new CliError("Prompt cancelled.", { exitCode: 130 }));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        finish();
        return;
      }

      if (key.name === "backspace") {
        secret = secret.slice(0, -1);
        return;
      }

      if (!key.ctrl && key.name !== "tab" && value) {
        secret += value;
      }
    };

    output.write(message);
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.on("keypress", onKeypress);
    input.resume();
  });
};
