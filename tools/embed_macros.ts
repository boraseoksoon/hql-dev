// tools/embed_macros.ts
// Generate core/src/lib/embedded-macros.ts by embedding macro sources

const macrosDir = new URL('../core/lib/macro/', import.meta.url);
const outPath = new URL('../core/src/lib/embedded-macros.ts', import.meta.url);

async function listMacroFiles(dir: URL): Promise<URL[]> {
  const files: URL[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith('.hql')) {
      files.push(new URL(entry.name, dir));
    }
  }
  // Deterministic order
  files.sort((a, b) => a.pathname.localeCompare(b.pathname));
  return files;
}

function asEmbeddedKey(fileUrl: URL): string {
  // Use forward-slash normalized relative path from repo root
  // e.g. "core/lib/macro/core.hql"
  const full = fileUrl.pathname.replace(/\\/g, '/');
  const idx = full.lastIndexOf('/core/lib/macro/');
  if (idx >= 0) return full.slice(idx + 1); // drop leading /
  // Fallback to file name
  return `core/lib/macro/${full.split('/').pop()}`;
}

function escapeBackticks(s: string): string {
  return s.replace(/`/g, '\\`');
}

const macroFiles = await listMacroFiles(macrosDir);
if (macroFiles.length === 0) {
  console.log('[embed-macros] No macro files found to embed.');
}

const entries: string[] = [];
for (const f of macroFiles) {
  const key = asEmbeddedKey(f);
  const src = await Deno.readTextFile(f);
  entries.push(`  ${JSON.stringify(key)}: ` + '`' + escapeBackticks(src) + '`,');
}

const fileContent = `// Auto-generated. Do not edit by hand.
// Embedded macro sources for core system macros.

export const EMBEDDED_MACROS = {
${entries.join('\n')}
} as const;

function normalize(p: string): string { return p.replace(/\\\\/g, '/'); }

export function isEmbeddedFile(p: string): boolean {
  const np = normalize(p);
  for (const k of Object.keys(EMBEDDED_MACROS)) {
    if (np.endsWith(k)) return true;
  }
  return false;
}

export function getEmbeddedContent(p: string): string | undefined {
  const np = normalize(p);
  for (const k of Object.keys(EMBEDDED_MACROS)) {
    if (np.endsWith(k)) return EMBEDDED_MACROS[k as keyof typeof EMBEDDED_MACROS];
  }
  return undefined;
}
`;

await Deno.mkdir(new URL('../core/src/lib/', import.meta.url), { recursive: true });
await Deno.writeTextFile(outPath, fileContent);
console.log('[embed-macros] Wrote', outPath.pathname);
