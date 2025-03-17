import * as stdPath from "jsr:@std/path@1.0.8";
import { exists } from "jsr:@std/fs@1.0.13";
import { Logger } from "../logger.ts";

/**
 * Clean up a directory
 */
export async function cleanupDir(dir: string, logger: Logger): Promise<void> {
  try {
    await Deno.remove(dir, { recursive: true });
    logger.debug(`Cleaned up directory: ${dir}`);
  } catch (e) {
    logger.error(`Error cleaning up ${dir}: ${e.message}`);
  }
}

/**
 * Platform interface defines all necessary platform-specific operations.
 */
export interface Platform {
  cwd(): string;
  stat(path: string): Promise<Deno.FileInfo>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, data: string): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  join(...segments: string[]): string;
  dirname(path: string): string;
  basename(path: string, ext?: string): string;
  extname(path: string): string;
  isAbsolute(path: string): boolean;
  resolve(...segments: string[]): string;
  relative(from: string, to: string): string;
  realPathSync(path: string): string;
  execPath(): string;
  runCmd(options: Deno.RunOptions): Deno.Process;
  readDir(path: string): AsyncIterable<Deno.DirEntry>;
  makeTempDir(): Promise<string>;
  exit(code: number): never;
  getEnv(key: string): string | undefined;
  setEnv(key: string, value: string): void;
  exists(path: string): Promise<boolean>;

  // Appended methods for complete abstraction
  getArgs(): string[];
  copyFile(src: string, dest: string): Promise<void>;
}

/**
 * DenoPlatform implements the Platform interface using Deno's APIs.
 */
export const DenoPlatform: Platform = {
  cwd: () => Deno.cwd(),
  stat: async (path: string): Promise<Deno.FileInfo> => await Deno.stat(path),
  readTextFile: async (path: string): Promise<string> => await Deno.readTextFile(path),
  writeTextFile: async (path: string, data: string): Promise<void> => await Deno.writeTextFile(path, data),
  mkdir: async (path: string, opts?: { recursive?: boolean }): Promise<void> => await Deno.mkdir(path, opts),
  join: (...segments: string[]): string => stdPath.join(...segments),
  dirname: (path: string): string => stdPath.dirname(path),
  basename: (path: string, ext?: string): string => stdPath.basename(path, ext),
  extname: (path: string): string => stdPath.extname(path),
  isAbsolute: (path: string): boolean => stdPath.isAbsolute(path),
  resolve: (...segments: string[]): string => stdPath.resolve(...segments),
  relative: (from: string, to: string): string => stdPath.relative(from, to),
  realPathSync: (path: string): string => Deno.realPathSync(path),
  execPath: (): string => Deno.execPath(),
  runCmd: (options: Deno.RunOptions): Deno.Process => Deno.run(options),
  readDir: (path: string): AsyncIterable<Deno.DirEntry> => Deno.readDir(path),
  makeTempDir: async (): Promise<string> => await Deno.makeTempDir(),
  exit: (code: number): never => Deno.exit(code),
  getEnv: (key: string): string | undefined => Deno.env.get(key),
  setEnv: (key: string, value: string): void => Deno.env.set(key, value),
  exists: async (path: string): Promise<boolean> => await exists(path),

  // Appended implementations
  getArgs: () => Deno.args,
  copyFile: (src: string, dest: string): Promise<void> => Deno.copyFile(src, dest),
};

/**
 * Export the current platform implementation.
 * In our case, it's DenoPlatform.
 */
export const CurrentPlatform: Platform = DenoPlatform;

/**
 * Re-export functions for backward compatibility.
 */
export const cwd = CurrentPlatform.cwd;
export const stat = CurrentPlatform.stat;
export const readTextFile = CurrentPlatform.readTextFile;
export const writeTextFile = CurrentPlatform.writeTextFile;
export const mkdir = CurrentPlatform.mkdir;
export const join = CurrentPlatform.join;
export const dirname = CurrentPlatform.dirname;
export const basename = CurrentPlatform.basename;
export const extname = CurrentPlatform.extname;
export const isAbsolute = CurrentPlatform.isAbsolute;
export const resolve = CurrentPlatform.resolve;
export const relative = CurrentPlatform.relative;
export const realPathSync = CurrentPlatform.realPathSync;
export const execPath = CurrentPlatform.execPath;
export const runCmd = CurrentPlatform.runCmd;
export const readDir = CurrentPlatform.readDir;
export const makeTempDir = CurrentPlatform.makeTempDir;
export const exit = CurrentPlatform.exit;
export const getEnv = CurrentPlatform.getEnv;
export const setEnv = CurrentPlatform.setEnv;
export const existsFn = CurrentPlatform.exists; // Exporting exists as existsFn
export { exists };
