// remote_registry.ts - Remote registry query utilities for HQL publish CLI
import { globalLogger as logger } from "../../src/logger.ts";

/**
 * Get the latest published version of a package from the NPM registry.
 * @param name - The NPM package name (e.g. "my-package")
 * @returns The latest version string, or null if not found
 */
export async function getNpmLatestVersion(name: string): Promise<string | null> {
  try {
    logger.debug && logger.debug(`Fetching latest version for NPM package: ${name}`);
    
    const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
    if (!resp.ok) {
      logger.debug && logger.debug(`NPM registry returned status: ${resp.status}`);
      return null;
    }
    
    const data = await resp.json();
    
    if (data && data["dist-tags"] && data["dist-tags"].latest) {
      const version = data["dist-tags"].latest;
      logger.debug && logger.debug(`Found NPM latest version: ${version}`);
      return version;
    }
    
    // Fallback: get highest version
    if (data && data.versions && typeof data.versions === "object") {
      const versions = Object.keys(data.versions);
      versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const highestVersion = versions[versions.length - 1] || null;
      logger.debug && logger.debug(`Found NPM highest version: ${highestVersion}`);
      return highestVersion;
    }
    
    logger.debug && logger.debug(`No versions found for NPM package: ${name}`);
    return null;
  } catch (err) {
    logger.debug && logger.debug(`Error fetching NPM version: ${err}`);
    return null;
  }
}

/**
 * Get the latest published version of a package from the JSR registry.
 * @param scope - The JSR scope (e.g. "user")
 * @param name - The JSR package name (e.g. "my-module")
 * @returns The latest version string, or null if not found
 */
export async function getJsrLatestVersion(scope: string, name: string): Promise<string | null> {
  try {
    logger.debug && logger.debug(`Fetching latest version for JSR package: @${scope}/${name}`);
    
    const resp = await fetch(`https://jsr.io/api/packages/${encodeURIComponent(scope)}/${encodeURIComponent(name)}`);
    if (!resp.ok) {
      logger.debug && logger.debug(`JSR registry returned status: ${resp.status}`);
      return null;
    }
    
    const data: { versions?: { version: string }[] } = await resp.json();
    
    if (data && Array.isArray(data.versions) && data.versions.length > 0) {
      const versions = data.versions.map((v) => v.version);
      versions.sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
      const latestVersion = versions[versions.length - 1] || null;
      logger.debug && logger.debug(`Found JSR latest version: ${latestVersion}`);
      return latestVersion;
    }
    
    logger.debug && logger.debug(`No versions found for JSR package: @${scope}/${name}`);
    return null;
  } catch (err) {
    logger.debug && logger.debug(`Error fetching JSR version: ${err}`);
    return null;
  }
}

/**
 * Validates a semver version string
 * @param version Version to validate
 * @returns true if valid, false otherwise
 */
export function isValidVersion(version: string): boolean {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

/**
 * Compares two semver version strings
 * @param v1 First version
 * @param v2 Second version
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  
  return 0;
}