// cli/publish/publish_npm.ts - Improved version
import {
  basename,
  dirname,
  exit,
  getEnv,
  join,
  mkdir,
  readTextFile,
  resolve,
  runCmd,
  writeTextFile,
} from "../../src/platform/platform.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";
import { incrementPatch, prompt } from "./utils.ts";
import { getNextVersionInDir } from "./publish_common.ts";

export async function publishNpm(options: {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
}): Promise<void> {
  console.log("\n📦 Starting NPM package publishing process");

  const inputPath = resolve(options.what);
  console.log(`  → Input path: "${inputPath}"`);

  let baseDir = inputPath;
  try {
    const stat = await Deno.stat(inputPath);
    if (stat.isFile) {
      baseDir = dirname(inputPath);
      console.log(`  → Input is a file, using directory: "${baseDir}"`);
    } else {
      console.log(`  → Input is a directory: "${baseDir}"`);
    }
  } catch (error) {
    console.error(
      `\n❌ Error checking input path: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    exit(1);
  }

  console.log(`\n🔨 Building JavaScript module from "${inputPath}"...`);
  const npmDistDir = await buildJsModule(inputPath);
  console.log(`\n✅ Module built successfully to: "${npmDistDir}"`);

  console.log(`\n📝 Reading/updating package configuration...`);
  const pkgJsonPath = join(npmDistDir, "package.json");
  let pkg: Record<string, any> = {};

  if (await exists(pkgJsonPath)) {
    try {
      console.log(`  → Reading existing package.json`);
      pkg = JSON.parse(await readTextFile(pkgJsonPath));
    } catch (error) {
      console.warn(
        `  ⚠️ Could not parse existing package.json: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      console.log(`  → Creating new package.json`);
      pkg = {};
    }
  } else {
    console.log(`  → No existing package.json found, creating new one`);
  }

  // Determine package name.
  if (options.name) {
    pkg.name = options.name;
    console.log(`  → Using provided package name: "${pkg.name}"`);
  } else if (!pkg.name) {
    const defaultName = basename(baseDir)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    console.log(`\n  Enter npm package name (default: "${defaultName}"):`);
    const userName = await prompt("", defaultName);
    pkg.name = userName || defaultName;
    console.log(`  → Using package name: "${pkg.name}"`);
  } else {
    console.log(`  → Using existing package name: "${pkg.name}"`);
  }

  // Determine package version.
  if (options.version) {
    pkg.version = options.version;
    console.log(`  → Using provided version: ${pkg.version}`);
  } else if (pkg.version) {
    pkg.version = incrementPatch(pkg.version);
    console.log(`  → Incremented version to: ${pkg.version}`);
  } else {
    const defaultVersion = "0.0.1";
    const userVer = await prompt(
      `\n  Enter version (default: "${defaultVersion}"):`,
      defaultVersion,
    );
    pkg.version = userVer || defaultVersion;
    console.log(`  → Using version: ${pkg.version}`);
  }

  // Set standard package.json fields
  pkg.description = pkg.description || `HQL module: ${pkg.name}`;
  pkg.module = pkg.module || "./esm/index.js";
  pkg.types = pkg.types || "./types/index.d.ts";
  pkg.files = pkg.files || ["esm", "types", "README.md"];

  await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));
  console.log(
    `  → Updated package.json with name=${pkg.name} version=${pkg.version}`,
  );

  // Create or use existing README
  const readmePath = join(npmDistDir, "README.md");
  if (!(await exists(readmePath))) {
    console.log(`  → Creating default README.md`);
    await writeTextFile(
      readmePath,
      `# ${pkg.name}\n\nAuto-generated README for the HQL module.\n`,
    );
  } else {
    console.log(`  → Using existing README.md`);
  }

  // Ensure directory structure exists
  console.log(`\n📂 Verifying package directory structure...`);
  const esmDir = join(npmDistDir, "esm");
  const typesDir = join(npmDistDir, "types");

  await mkdir(esmDir, { recursive: true });
  console.log(`  → Verified ESM directory: "${esmDir}"`);

  await mkdir(typesDir, { recursive: true });
  console.log(`  → Verified types directory: "${typesDir}"`);

  // Copy files or create default ones if missing
  try {
    console.log(`\n📄 Setting up package files...`);
    const esmFile = join(baseDir, ".build", "esm.js");
    if (await exists(esmFile)) {
      console.log(`  → Reading ESM file from build directory`);
      const esmContent = await readTextFile(esmFile);
      await writeTextFile(join(esmDir, "index.js"), esmContent);
      console.log(`  → Copied ESM file to package`);
    } else {
      console.log(`  → Creating stub ESM file`);
      await writeTextFile(
        join(esmDir, "index.js"),
        `export default { name: "${pkg.name}" };\n`,
      );
    }

    console.log(`  → Creating TypeScript definition file`);
    await writeTextFile(
      join(typesDir, "index.d.ts"),
      `declare const _default: any;\nexport default _default;\n`,
    );
  } catch (error) {
    console.error(
      `\n❌ Error setting up package files: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    exit(1);
  }

  console.log(`\n🚀 Publishing package ${pkg.name}@${pkg.version} to npm...`);
  const dryRun = getEnv("DRY_RUN_PUBLISH");

  const publishCmd = dryRun
    ? ["npm", "publish", "--dry-run", "--access", "public", "--force"]
    : ["npm", "publish", "--access", "public", "--force"];

  console.log(`  → Running: ${publishCmd.join(" ")}`);

  const proc = runCmd({
    cmd: publishCmd,
    cwd: npmDistDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const status = await proc.status();
  proc.close();

  if (!status.success) {
    console.error(`\n❌ npm publish failed with exit code ${status.code}.`);
    exit(status.code);
  }

  console.log(`\n✅ Package published successfully to npm!`);
  console.log(`📦 View it at: https://www.npmjs.com/package/${pkg.name}`);
}
