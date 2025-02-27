import transpileCLI from "../cli/transpile.ts";
import { assertEquals, assertStringIncludes, assertRejects } from "https://deno.land/std/testing/asserts.ts";
import { join, dirname } from "https://deno.land/std@0.170.0/path/mod.ts"; 

// Helper to create a temporary test directory
async function createTempDir(): Promise<string> {
  const tempDir = join(Deno.cwd(), "test", "temp", crypto.randomUUID().toString());
  await Deno.mkdir(tempDir, { recursive: true });
  return tempDir;
}

// Helper to clean up a temporary directory
async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await Deno.remove(dirPath, { recursive: true });
  } catch (e) {
    console.warn(`Warning: Could not clean up temp directory ${dirPath}: ${e.message}`);
  }
}

// Create a test HQL file
async function createTestFile(dirPath: string, filename: string, content: string): Promise<string> {
  const filePath = join(dirPath, filename);
  await Deno.writeTextFile(filePath, content);
  return filePath;
}

// Basic input/output test without mocking
Deno.test("transpileCLI - basic file creation", async () => {
  const tempDir = await createTempDir();
  try {
    // Create a simple test HQL file
    const inputPath = await createTestFile(
      tempDir, 
      "simple_test.hql",
      "(def greeting \"Hello, world!\")\n(print greeting)"
    );
    
    // Custom output path
    const outputPath = join(tempDir, "output.js");
    
    // Transpile the file
    await transpileCLI(inputPath, outputPath);
    
    // Verify output file was created
    const outputExists = await Deno.stat(outputPath).then(
      () => true,
      () => false
    );
    assertEquals(outputExists, true, "Output file should be created");
    
  } finally {
    await cleanupTempDir(tempDir);
  }
});

// Test with custom output directory creation
Deno.test("transpileCLI - custom output directory creation", async () => {
  const tempDir = await createTempDir();
  try {
    // Create a test HQL file
    const inputPath = await createTestFile(
      tempDir, 
      "test.hql",
      "(def greeting \"Hello, world!\")"
    );
    
    // Custom output path in a subdirectory that doesn't exist yet
    const customOutputPath = join(tempDir, "nested", "output", "custom.js");
    
    // Transpile with custom output path
    await transpileCLI(inputPath, customOutputPath);
    
    // Verify output file was created at custom path
    const outputExists = await Deno.stat(customOutputPath).then(
      () => true,
      () => false
    );
    assertEquals(outputExists, true, "Output file should be created in nested directory");
    
  } finally {
    await cleanupTempDir(tempDir);
  }
});

// Test error handling for missing input file
Deno.test("transpileCLI - missing input file", async () => {
  const tempDir = await createTempDir();
  try {
    // Path to a non-existent file
    const nonExistentPath = join(tempDir, "does_not_exist.hql");
    
    // Transpile should reject with an error containing "File not found"
    await assertRejects(
      async () => {
        await transpileCLI(nonExistentPath);
      },
      Error,
      "File not found"
    );
    
  } finally {
    await cleanupTempDir(tempDir);
  }
});

// Test for syntax error in HQL file (no mocking needed)
Deno.test("transpileCLI - syntax error handling", async () => {
  const tempDir = await createTempDir();
  try {
    // Create a file with invalid HQL syntax (missing closing parenthesis)
    const inputPath = await createTestFile(
      tempDir,
      "invalid_syntax.hql",
      "(def greeting \"Hello, world!\")\n(def x\n"
    );
    
    // Transpilation should fail with a parser error (containing "Parse error")
    await assertRejects(
      async () => {
        await transpileCLI(inputPath);
      },
      Error,
      "Parse error"
    );
    
  } finally {
    await cleanupTempDir(tempDir);
  }
});
