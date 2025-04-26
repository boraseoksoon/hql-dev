// remote_registry.ts - Remote registry query utilities for HQL publish CLI

/**
 * Get the latest published version of a package from the NPM registry.
 * @param name - The NPM package name (e.g. "my-package")
 * @returns The latest version string, or null if not found
 */
export async function getNpmLatestVersion(name: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data["dist-tags"] && data["dist-tags"].latest) {
      return data["dist-tags"].latest;
    }
    // Fallback: get highest version
    if (data && data.versions && typeof data.versions === "object") {
      const versions = Object.keys(data.versions);
      versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return versions[versions.length - 1] || null;
    }
    return null;
  } catch (_err) {
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
    const resp = await fetch(`https://jsr.io/api/packages/${encodeURIComponent(scope)}/${encodeURIComponent(name)}`);
    if (!resp.ok) return null;
    const data: { versions?: { version: string }[] } = await resp.json();
    if (data && Array.isArray(data.versions) && data.versions.length > 0) {
      const versions = data.versions.map((v) => v.version);
      versions.sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
      return versions[versions.length - 1] || null;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

/**
 * Check if the current user can publish to the given NPM package name.
 * (Requires user to be logged in; otherwise, will return false.)
 * This implementation attempts to use the NPM API, but for full accuracy, use `npm access` CLI.
 * @param name - The NPM package name
 * @returns true if publish is allowed, false otherwise
 */
export async function checkNpmPublishPermission(name: string): Promise<boolean> {
  // There is no fully reliable REST API for this; fallback to assuming publish allowed for new packages.
  // For existing packages, user must be owner/collaborator.
  // Consider running `npm access ls-collaborators <name>` via child_process for full check.
  const latest = await getNpmLatestVersion(name);
  if (!latest) return true; // Package does not exist yet
  // If package exists, assume user must be owner; real check is via CLI
  return false; // Let the publish step fail if not owner
}

/**
 * Check if the current user can publish to the given JSR package.
 * (Currently, rely on publish attempt for permission errors.)
 * @returns true if publish is allowed, false otherwise
 */
export async function checkJsrPublishPermission(_scope: string, _name: string): Promise<boolean> {
  // No public API for this yet; rely on publish error handling
  return Promise.resolve(true);
}
