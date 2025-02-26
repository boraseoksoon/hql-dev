// cli/publish/publish_jsr.ts
import {
  join,
  resolve,
  readTextFile,
  writeTextFile,
  mkdir,
  runCmd,
  exit,
  makeTempDir,
  basename,
  dirname,
  getEnv,
} from "../../src/platform/platform.ts";
import { exists, copy } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";

/** Prompt helper: returns the user’s input, or defaultValue if they press Enter. */
async function prompt(question: string, defaultValue = ""): Promise<string> {
  Deno.stdout.writeSync(new TextEncoder().encode(`${question} `));
  const buf = new Uint8Array(1024);
  const n = <number>await Deno.stdin.read(buf);
  if (n <= 0) return defaultValue;
  const input = new TextDecoder().decode(buf.subarray(0, n)).trim();
  return input === "" ? defaultValue : input;
}

/** Simple helper to increment the patch part of X.Y.Z -> X.Y.(Z+1). */
function incrementPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return "0.0.1";
  const [major, minor, patch] = parts;
  return `${major}.${minor}.${parseInt(patch, 10) + 1}`;
}

/**
 * Loads (or creates) a jsr.json config from distDir.
 * 1) If jsr.json exists, parse it and reuse name/version.
 * 2) If there's a name, parse the scope (username) from it.
 * 3) If version is present, auto-increment unless overridden by CLI.
 * 4) If missing fields, prompt for them.
 */
async function getJsrConfig(
  distDir: string,
  cliName: string | undefined,
  cliVersion: string | undefined,
): Promise<{ configPath: string; config: any; jsrUser: string }> {
  const configPath = join(distDir, "jsr.json");
  let config: Record<string, any> = {};
  let jsrUser = getEnv("JSR_USER") || "js-user";

  // Check if jsr.json already exists
  if (await exists(configPath)) {
    try {
      const content = await readTextFile(configPath);
      config = JSON.parse(content);
    } catch {
      // If parsing fails, start fresh
      config = {};
    }
  }

  // 1) Reuse or parse the existing package name if present
  let existingName = typeof config.name === "string" ? config.name : "";
  // If the user explicitly passed a package name on CLI, that overrides
  if (cliName) {
    existingName = cliName;
  }

  // 2) If we still have no name, prompt for it
  if (!existingName) {
    // Derive a default name from the folder name
    const dirName = basename(distDir);
    const fallbackBase = dirName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "js-module";

    const fallbackName = `@${jsrUser}/${fallbackBase}`;
    const userName = await prompt(`Enter JSR package name (default: "${fallbackName}"):`, fallbackName);
    existingName = userName.startsWith("@") ? userName : `@${jsrUser}/${userName}`;
  }

  // 3) Parse the scope (username) from the package name if it starts with '@scope/'
  //    e.g. @boraseoksoon/hql-module => scope = "boraseoksoon"
  if (existingName.startsWith("@")) {
    const match = existingName.match(/^@([^/]+)\//);
    if (match) {
      jsrUser = match[1];
    }
  }

  // 4) Decide on a version
  //    - If CLI version is given, use that
  //    - Else if config.version exists, auto-increment
  //    - Else prompt
  let existingVersion = typeof config.version === "string" ? config.version : "";
  if (cliVersion) {
    existingVersion = cliVersion;
  } else if (existingVersion) {
    existingVersion = incrementPatch(existingVersion);
  } else {
    const defaultVersion = "0.0.1";
    const userVer = await prompt(`Enter version (default: "${defaultVersion}"):`, defaultVersion);
    existingVersion = userVer;
  }

  // Write them back into config
  config.name = existingName;
  config.version = existingVersion;

  // If exports or publish is missing, fill them in
  if (!config.exports) {
    config.exports = "./esm/index.js";
  }
  if (!config.publish) {
    config.publish = {
      include: ["README.md", "esm/**/*", "types/**/*", "jsr.json"],
    };
  }

  return { configPath, config, jsrUser };
}

/**
 * Publishes a module to JSR, storing config in jsr.json.
 * If jsr.json already has name/version, we reuse & auto-increment version,
 * skipping prompts unless something is missing or overridden via CLI.
 */
export async function publishJSR(options: {
  what: string;
  name?: string;      // CLI override for package name
  version?: string;   // CLI override for version
  verbose?: boolean;
}): Promise<void> {
  // For dev only: skip login checks
  Deno.env.set("SKIP_LOGIN_CHECK", "1");

  // Resolve path and ensure it's a directory
  const inputPath = resolve(options.what);
  let baseDir = inputPath;
  try {
    const stat = await Deno.stat(inputPath);
    if (stat.isFile) {
      baseDir = dirname(inputPath);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    exit(1);
  }

  // Build the JS module (which outputs to a dist folder, e.g. "npm/")
  const distDir = await buildJsModule(inputPath);

  // Load or create the JSR config
  const { configPath, config, jsrUser } = await getJsrConfig(
    distDir,
    options.name,
    options.version,
  );

  // If environment variable JSR_USER wasn't set, or was "js-user", but we
  // successfully parsed from config.name, we skip the prompt. 
  // But if you still want to confirm the username, you could do so here:
  if (!getEnv("JSR_USER") && jsrUser === "js-user") {
    // If we still haven't found a real user scope, prompt:
    const finalUser = await prompt(
      `JSR username not found. Enter your JSR username (default: "js-user"):`,
      "js-user",
    );
    // Possibly we would parse config.name again if needed...
    // For simplicity, we won't do that here.
  }

  // Save the updated config
  await writeTextFile(configPath, JSON.stringify(config, null, 2));

  // Ensure a README
  const readmePath = join(distDir, "README.md");
  if (!(await exists(readmePath))) {
    await writeTextFile(
      readmePath,
      `# ${config.name}\n\nAuto-generated README for JSR package.\n`,
    );
  }

  // Publish from a temporary directory
  console.log(`\nPublishing ${config.name}@${config.version} to JSR...`);
  const tempDir = await makeTempDir();
  await copy(distDir, tempDir, { overwrite: true });

  const publishFlags = ["--allow-dirty"];
  if (options.verbose) {
    publishFlags.push("--verbose");
  }
  const publishProc = runCmd({
    cmd: ["deno", "publish", ...publishFlags],
    cwd: tempDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await publishProc.status();
  publishProc.close();

  if (!status.success) {
    console.error(`
JSR publish failed with code ${status.code}.
Possible issues:
- You may not be logged in to JSR. Try 'deno login jsr.io' first.
- You may not have permission to publish to this package name.
- There might be type errors in the generated code.
`);
    exit(status.code);
  }

  console.log(`
✅ JSR publish succeeded!
📦 View your package at: https://jsr.io/packages/${encodeURIComponent(config.name)}
`);
}
