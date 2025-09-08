// Minimal no-op embed script to satisfy publish:prep
// If embedded macro file is missing, create a stub; otherwise, do nothing.
const outPath = new URL('../core/src/lib/embedded-macros.ts', import.meta.url);
try {
  await Deno.stat(outPath);
  console.log('[embed-macros] embedded-macros.ts already present. Skipping.');
} catch {
  const content = `// Auto-generated file containing embedded macro sources (stub)\n\nexport function isEmbeddedFile(_path: string): boolean {\n  return false;\n}\n\nexport function getEmbeddedContent(_path: string): string | undefined {\n  return undefined;\n}\n\nexport const EMBEDDED_MACROS = {};\n`;
  await Deno.mkdir(new URL('../core/src/lib/', import.meta.url), { recursive: true });
  await Deno.writeTextFile(outPath, content);
  console.log('[embed-macros] Wrote stub embedded-macros.ts');
}

