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
import { prompt, incrementPatch } from "./utils.ts";
import { getNextVersionInDir } from "./publish_common.ts"; // still used for npm versioning if needed

export async function publishNpm(options: {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
}): Promise<void> {
  const inputPath = resolve(options.what);
  let baseDir = inputPath;
  try {
    const stat = await Deno.stat(inputPath);
    if (stat.isFile) {
      baseDir = dirname(inputPath);
    }
  } catch (error) {
    console.error(`Error checking input path: ${error.message}`);
    exit(1);
  }

  const npmDistDir = await buildJsModule(inputPath);
  const pkgJsonPath = join(npmDistDir, "package.json");
  let pkg: Record<string, any> = {};

  if (await exists(pkgJsonPath)) {
    try {
      pkg = JSON.parse(await readTextFile(pkgJsonPath));
    } catch (error) {
      console.warn("Could not parse existing package.json:", error.message);
      pkg = {};
    }
  }

  // Determine package name.
  if (options.name) {
    pkg.name = options.name;
  } else if (!pkg.name) {
    const defaultName = basename(baseDir)
      .toLowerCase()
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

  // Determine package version.
  if (options.version) {
    pkg.version = options.version;
  } else if (pkg.version) {
    pkg.version = incrementPatch(pkg.version);
    console.log(`Incremented version to: ${pkg.version}`);
  } else {
    const defaultVersion = "0.0.1";
    const userVer = await prompt(`\nEnter version (default: "${defaultVersion}"):`, defaultVersion);
    pkg.version = userVer || defaultVersion;
    console.log(`Using version: ${pkg.version}`);
  }

  pkg.description = pkg.description || `HQL module: ${pkg.name}`;
  pkg.module = pkg.module || "./esm/index.js";
  pkg.types = pkg.types || "./types/index.d.ts";
  pkg.files = pkg.files || ["esm", "types", "README.md"];

  await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));
  console.log(`\nUpdated package.json with name=${pkg.name} version=${pkg.version}`);

  const readmePath = join(npmDistDir, "README.md");
  if (!(await exists(readmePath))) {
    await writeTextFile(readmePath, `# ${pkg.name}\n\nAuto-generated README for the HQL module.\n`);
  }

  const esmDir = join(npmDistDir, "esm");
  const typesDir = join(npmDistDir, "types");
  await mkdir(esmDir, { recursive: true });
  await mkdir(typesDir, { recursive: true });

  try {
    const esmFile = join(baseDir, ".build", "esm.js");
    const esmContent = await readTextFile(esmFile);
    await writeTextFile(join(esmDir, "index.js"), esmContent);
  } catch (error) {
    console.error(`Error copying ESM file: ${error.message}`);
    await writeTextFile(join(esmDir, "index.js"), `export default { name: "${pkg.name}" };\n`);
  }

  await writeTextFile(join(typesDir, "index.d.ts"), `declare const _default: any;\nexport default _default;\n`);

  console.log(`\nPublishing package ${pkg.name}@${pkg.version} to npm...`);
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
    console.error(`\nnpm publish failed with exit code ${status.code}.`);
    exit(status.code);
  }

  console.log(`\n✅ Package published successfully to npm!\n📦 View it at: https://www.npmjs.com/package/${pkg.name}`);
}
