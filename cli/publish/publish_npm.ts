// cli/publish/publish_npm.ts
import {
  join,
  resolve,
  readTextFile,
  writeTextFile,
  mkdir,
  runCmd,
  exit,
  getEnv,
  basename,
  dirname,
} from "../../src/platform/platform.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";

/** Simple helper: reads a line from stdin, returns default if empty. */
async function prompt(question: string, defaultValue = ""): Promise<string> {
  Deno.stdout.writeSync(new TextEncoder().encode(`${question} `));
  const buf = new Uint8Array(1024);
  const n = <number>await Deno.stdin.read(buf);
  if (n <= 0) return defaultValue;
  const input = new TextDecoder().decode(buf.subarray(0, n)).trim();
  return input === "" ? defaultValue : input;
}

/** Increments the patch part of X.Y.Z -> X.Y.(Z+1). */
function incrementPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return "0.0.1";
  const [major, minor, patch] = parts;
  const newPatch = parseInt(patch, 10) + 1;
  return `${major}.${minor}.${newPatch}`;
}

/**
 * Publishes a module to npm, using ONLY package.json for version/name.
 * No references to jsr.json or a VERSION file.
 */
export async function publishNpm(options: {
  what: string;
  name?: string;     // CLI-specified package name
  version?: string;  // CLI-specified version
  verbose?: boolean;
}): Promise<void> {
  const inputPath = resolve(options.what);

  // Determine if "what" is a file or directory
  let isFile = false;
  let baseDir = inputPath;
  try {
    const stat = await Deno.stat(inputPath);
    isFile = stat.isFile;
    if (isFile) {
      baseDir = dirname(inputPath);
    }
  } catch (error) {
    console.error(`Error checking input path: ${error.message}`);
    exit(1);
  }

  // Build the JS module => creates "npm/" folder
  const npmDistDir = await buildJsModule(inputPath);

  // Attempt to read or create package.json
  const pkgJsonPath = join(npmDistDir, "package.json");
  let pkg: Record<string, any> = {};
  let pkgExists = false;

  if (await exists(pkgJsonPath)) {
    pkgExists = true;
    try {
      const content = await readTextFile(pkgJsonPath);
      pkg = JSON.parse(content);
    } catch (error) {
      console.warn("Warning: Could not parse existing package.json:", error.message);
      // Start fresh if parse fails
      pkg = {};
    }
  }

  // 1. Determine package name
  //    Priority: CLI --name > existing package.json > prompt user
  if (options.name) {
    pkg.name = options.name;
  } else if (!pkg.name) {
    // No existing name in package.json => prompt user
    const dirName = basename(baseDir);
    const defaultName = dirName.toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    console.log(`\nEnter npm package name (default: "${defaultName}"):`);
    const userName = await prompt("", defaultName);
    pkg.name = userName || defaultName;
    console.log(`Using package name: ${pkg.name}`);
  } else {
    console.log(`Using existing package name: ${pkg.name}`);
  }

  // 2. Determine package version
  //    Priority: CLI --version > existing package.json > prompt user (brand-new) or auto-increment
  if (options.version) {
    // If CLI overrides version
    pkg.version = options.version;
  } else if (pkg.version) {
    // If there's an existing version, auto-increment it
    pkg.version = incrementPatch(pkg.version);
    console.log(`Incremented version to: ${pkg.version}`);
  } else {
    // Brand-new: prompt user
    const defaultVersion = "0.0.1";
    const userVer = await prompt(
      `\nEnter version (default: "${defaultVersion}"):`,
      defaultVersion
    );
    pkg.version = userVer || defaultVersion;
    console.log(`Using version: ${pkg.version}`);
  }

  // Provide some default fields if missing
  if (!pkg.description) {
    pkg.description = `HQL module: ${pkg.name}`;
  }
  if (!pkg.module) {
    pkg.module = "./esm/index.js";
  }
  if (!pkg.types) {
    pkg.types = "./types/index.d.ts";
  }
  if (!pkg.files) {
    pkg.files = ["esm", "types", "README.md"];
  }

  // Write updated package.json
  await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));
  console.log(`\nUpdated package.json with name=${pkg.name} version=${pkg.version}`);

  // Ensure README.md exists
  const readmePath = join(npmDistDir, "README.md");
  if (!(await exists(readmePath))) {
    await writeTextFile(
      readmePath,
      `# ${pkg.name}\n\nAuto-generated README for the HQL module.\n`
    );
  }

  // Create "esm/" and "types/" directories
  const esmDir = join(npmDistDir, "esm");
  const typesDir = join(npmDistDir, "types");

  try {
    await mkdir(esmDir, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }
  try {
    await mkdir(typesDir, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }

  // Copy the ESM file
  try {
    const esmFile = join(baseDir, ".build", "esm.js");
    const esmContent = await Deno.readTextFile(esmFile);
    await writeTextFile(join(esmDir, "index.js"), esmContent);
  } catch (error) {
    console.error(`Error copying ESM file: ${error.message}`);
    // fallback stub
    await writeTextFile(join(esmDir, "index.js"), `export default { name: "${pkg.name}" };\n`);
  }

  // Create a simple type definition
  await writeTextFile(
    join(typesDir, "index.d.ts"),
    `declare const _default: any;\nexport default _default;\n`
  );

  // Finally, publish to npm
  console.log(`\nPublishing package ${pkg.name}@${pkg.version} to npm...`);

  // If environment variable DRY_RUN_PUBLISH is set, do a dry run
  const dryRun = getEnv("DRY_RUN_PUBLISH");
  const publishCmd = dryRun
    ? ["npm", "publish", "--dry-run", "--access", "public", "--force"]
    : ["npm", "publish", "--access", "public", "--force"];

  const proc = runCmd({
    cmd: publishCmd,
    cwd: npmDistDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await proc.status();
  proc.close();

  if (!status.success) {
    console.error(`
npm publish failed with exit code ${status.code}. 
Possible issues:
- You may not be logged in to npm. Try 'npm login' first.
- You may not have permission to publish to this package name.
- The package version may already exist.
`);
    exit(status.code);
  }

  console.log(`
✅ Package published successfully to npm!
📦 View it at: https://www.npmjs.com/package/${pkg.name}
`);
}
