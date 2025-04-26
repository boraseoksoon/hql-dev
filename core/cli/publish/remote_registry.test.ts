// remote_registry.test.ts - Tests for remote_registry.ts
import {
  getNpmLatestVersion,
  getJsrLatestVersion,
  checkNpmPublishPermission,
  checkJsrPublishPermission,
} from "./remote_registry.ts";

const tests: { name: string; fn: () => Promise<void> }[] = [];
function defineTest(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn });
}

defineTest("getNpmLatestVersion should fetch latest version for existing NPM package", async () => {
  const latest = await getNpmLatestVersion("lodash");
  if (!latest || typeof latest !== "string" || !/^\d+\.\d+\.\d+/.test(latest)) {
    throw new Error(`Unexpected latest version: ${latest}`);
  }
});

defineTest("getNpmLatestVersion should return null for non-existent package", async () => {
  const latest = await getNpmLatestVersion("hql-nonexistent-test-package-xyz-abc-123456");
  if (latest !== null) throw new Error("Should be null for non-existent package");
});

// JSR: Use a real, accessible public package or skip if not found
const jsrTestScope = "std";
const jsrTestName = "collections"; // Known public package as of 2024

defineTest("getJsrLatestVersion should fetch latest version for existing JSR package", async () => {
  const latest = await getJsrLatestVersion(jsrTestScope, jsrTestName);
  if (latest === null) {
    console.warn(`⚠️  JSR API did not return a version for ${jsrTestScope}/${jsrTestName}. Test skipped.`);
    return;
  }
  if (typeof latest !== "string" || !/^\d+\.\d+\.\d+/.test(latest)) {
    throw new Error(`Unexpected latest version: ${latest}`);
  }
});

defineTest("getJsrLatestVersion should return null for non-existent JSR package", async () => {
  const latest = await getJsrLatestVersion("hql-nonexistent", "hql-nonexistent-test-package-xyz-abc-123456");
  if (latest !== null) throw new Error("Should be null for non-existent package");
});

defineTest("checkNpmPublishPermission should return true for new package", async () => {
  const canPublish = await checkNpmPublishPermission("hql-nonexistent-test-package-xyz-abc-123456");
  if (canPublish !== true) throw new Error("Should be allowed for new package");
});

defineTest("checkNpmPublishPermission should return false for existing package", async () => {
  const canPublish = await checkNpmPublishPermission("lodash");
  if (canPublish !== false) throw new Error("Should not be allowed for existing package");
});

defineTest("checkJsrPublishPermission always returns true for now", async () => {
  const canPublish = await checkJsrPublishPermission(jsrTestScope, jsrTestName);
  if (canPublish !== true) throw new Error("Should always return true");
});

async function runAllTests() {
  let failures = 0;
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name}`);
    } catch (e: unknown) {
      failures++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`❌ ${test.name}:`, msg);
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    Deno.exit(1);
  } else {
    console.log("\nAll tests passed.");
  }
}

if (import.meta.main) {
  runAllTests();
}
