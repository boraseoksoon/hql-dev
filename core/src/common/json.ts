import { exists } from "jsr:@std/fs@1.0.13";
import { readTextFile, writeTextFile } from "../../src/platform/platform.ts";

export async function readJSON(path: string): Promise<Record<string, unknown>> {
    try {
        if (await exists(path)) {
            const content = await readTextFile(path);
            return JSON.parse(content);
        }
    } catch (err) {
        // Ignore errors and return empty object
    }
    
    return {};
}

export async function writeJSON(path: string, data: Record<string, unknown>): Promise<void> {
    await writeTextFile(path, JSON.stringify(data, null, 2));
}