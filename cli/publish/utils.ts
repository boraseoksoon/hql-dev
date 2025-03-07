// cli/publish/utils.ts
import { readTextFile, writeTextFile, exists } from "../../src/platform/platform.ts";

/** Prompt the user with a question; return the entered value or the default if empty. */
export async function prompt(question: string, defaultValue = ""): Promise<string> {
  Deno.stdout.writeSync(new TextEncoder().encode(`${question} `));
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  if (n === null || n <= 0) return defaultValue;
  const input = new TextDecoder().decode(buf.subarray(0, n)).trim();
  return input === "" ? defaultValue : input;
}

/** Increment a semver patch (X.Y.Z -> X.Y.(Z+1)); if not valid, return "0.0.1". */
export function incrementPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return "0.0.1";
  const [major, minor, patch] = parts;
  const newPatch = parseInt(patch, 10) + 1;
  return `${major}.${minor}.${newPatch}`;
}

/** Safely read a JSON file; return an empty object if missing or parse error. */
export async function readJSON(filePath: string): Promise<any> {
  if (await exists(filePath)) {
    try {
      return JSON.parse(await readTextFile(filePath));
    } catch (error) {
      console.warn(`Warning: Failed to parse ${filePath}: ${error.message}`);
    }
  }
  return {};
}

/** Write a JSON object to a file with pretty-printing. */
export async function writeJSON(filePath: string, data: any): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
}
