// cli/publish/publish_common.ts
import { join, readTextFile, writeTextFile, runCmd, getEnv } from "../../src/platform/platform.ts";
import { exists, ensureDir } from "jsr:@std/fs@1.0.13";

/**
 * Returns the next version string for the given directory.
 * (This is used by the NPM flow only.)
 */
export async function getNextVersionInDir(
  outDir: string,
  provided?: string,
): Promise<string> {
  const versionFile = join(outDir, "VERSION");
  await ensureDir(outDir, { recursive: true });
  
  if (provided) {
    await writeTextFile(versionFile, provided);
    console.log(`Setting version to ${provided} in ${outDir}`);
    return provided;
  }
  
  const packageJsonPath = join(outDir, "package.json");
  if (await exists(packageJsonPath)) {
    try {
      const pkgJson = JSON.parse(await readTextFile(packageJsonPath));
      if (pkgJson.version && typeof pkgJson.version === "string") {
        const parts = pkgJson.version.split(".");
        if (parts.length === 3) {
          const [major, minor, patch] = parts;
          const newVersion = `${major}.${minor}.${parseInt(patch) + 1}`;
          console.log(`Incrementing version from ${pkgJson.version} to ${newVersion}`);
          pkgJson.version = newVersion;
          await writeTextFile(packageJsonPath, JSON.stringify(pkgJson, null, 2));
          await writeTextFile(versionFile, newVersion);
          return newVersion;
        }
        console.log(`Using version ${pkgJson.version} from package.json`);
        return pkgJson.version;
      }
    } catch (error) {
      console.warn(`Error reading package.json: ${error.message}`);
    }
  }
  
  const jsrConfigPath = join(outDir, "jsr.json");
  if (await exists(jsrConfigPath)) {
    try {
      const jsrConfig = JSON.parse(await readTextFile(jsrConfigPath));
      if (jsrConfig.version && typeof jsrConfig.version === "string") {
        const parts = jsrConfig.version.split(".");
        if (parts.length === 3) {
          const [major, minor, patch] = parts;
          const newVersion = `${major}.${minor}.${parseInt(patch) + 1}`;
          console.log(`Incrementing version from ${jsrConfig.version} to ${newVersion}`);
          jsrConfig.version = newVersion;
          await writeTextFile(jsrConfigPath, JSON.stringify(jsrConfig, null, 2));
          await writeTextFile(versionFile, newVersion);
          return newVersion;
        }
        console.log(`Using version ${jsrConfig.version} from jsr.json`);
        return jsrConfig.version;
      }
    } catch (error) {
      console.warn(`Error reading jsr.json: ${error.message}`);
    }
  }
  
  if (!(await exists(versionFile))) {
    const defaultVersion = "0.0.1";
    await writeTextFile(versionFile, defaultVersion);
    console.log(`No VERSION file found in ${outDir}. Setting version to ${defaultVersion}`);
    return defaultVersion;
  }
  
  try {
    const current = (await readTextFile(versionFile)).trim();
    const parts = current.split(".");
    if (parts.length !== 3) {
      throw new Error(`Invalid version format in ${versionFile}: "${current}"`);
    }
    const [major, minor] = parts;
    let patch = parseInt(parts[2], 10);
    if (isNaN(patch)) {
      throw new Error(`Invalid patch version in ${versionFile}: "${parts[2]}"`);
    }
    patch++;
    const newVersion = `${major}.${minor}.${patch}`;
    await writeTextFile(versionFile, newVersion);
    console.log(`Bumped version from ${current} to ${newVersion} in ${outDir}`);
    return newVersion;
  } catch (error) {
    console.error(`Error incrementing version: ${error.message}`);
    const fallbackVersion = "0.1.0";
    await writeTextFile(versionFile, fallbackVersion);
    console.log(`Using fallback version ${fallbackVersion}`);
    return fallbackVersion;
  }
}

/**
 * Auto-detects the npm username.
 */
export async function getNpmUsername(): Promise<string | undefined> {
  let npmUser = getEnv("NPM_USERNAME");
  if (npmUser) return npmUser.trim();
  try {
    const proc = runCmd({
      cmd: ["npm", "whoami"],
      stdout: "piped",
      stderr: "null",
    });
    const output = await proc.output();
    proc.close();
    npmUser = new TextDecoder().decode(output).trim();
    return npmUser || undefined;
  } catch (error) {
    console.warn("Failed to auto-detect npm username:", error.message);
    return undefined;
  }
}

/**
 * Get the current user's JSR username.
 */
export async function getJsrUsername(): Promise<string> {
  try {
    const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
    const registriesPath = join(homeDir, ".deno", "registries.json");
    if (await exists(registriesPath)) {
      const registries = JSON.parse(await readTextFile(registriesPath));
      if (registries.jsr && registries.jsr.user && registries.jsr.user.name) {
        return registries.jsr.user.name;
      }
    }
  } catch (error) {
    console.warn("Could not read JSR username:", error.message);
  }
  return "username";
}

/**
 * Check that required tools (Deno, npm) are installed and configured.
 */
export async function checkEnvironment(publishTarget: "npm" | "jsr"): Promise<boolean> {
  try {
    const denoProc = runCmd({
      cmd: ["deno", "--version"],
      stdout: "piped",
      stderr: "null",
    });
    const denoOutput = await denoProc.output();
    denoProc.close();
    if (denoOutput.length === 0) {
      console.error("Deno not found. Please install Deno: https://deno.land/manual/getting_started/installation");
      return false;
    }
    if (publishTarget === "npm") {
      const npmProc = runCmd({
        cmd: ["npm", "--version"],
        stdout: "piped",
        stderr: "null",
      });
      const npmOutput = await npmProc.output();
      npmProc.close();
      if (npmOutput.length === 0) {
        console.error("npm not found. Please install Node.js and npm: https://nodejs.org/");
        return false;
      }
      try {
        const whoamiProc = runCmd({
          cmd: ["npm", "whoami"],
          stdout: "piped",
          stderr: "null",
        });
        const whoamiOutput = await whoamiProc.output();
        whoamiProc.close();
        if (whoamiOutput.length === 0) {
          console.warn("Not logged in to npm. Please run 'npm login' first.");
          return false;
        }
      } catch (error) {
        console.warn("npm login check failed. Please run 'npm login' before publishing.");
        return false;
      }
    }
    if (publishTarget === "jsr") {
      try {
        const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
        const registriesPath = join(homeDir, ".deno", "registries.json");
        if (!(await exists(registriesPath))) {
          console.warn("JSR configuration not found. You may need to run 'deno login jsr.io'.");
          return false;
        }
      } catch (error) {
        console.warn("JSR login check failed:", error.message);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("Environment check failed:", error.message);
    return false;
  }
}
