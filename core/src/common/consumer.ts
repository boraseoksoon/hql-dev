// consumer.ts - Source map stack trace consumer for HQL -> JS/TS error mapping

import { SourceMapConsumer } from "npm:source-map@0.7.4";

/**
 * Extracts the inline source map from a JS bundle file.
 * Returns the parsed source map object, or null if not found.
 */
export async function extractInlineSourceMap(bundlePath: string): Promise<any | null> {
  try {
    console.log('[extractInlineSourceMap] Reading bundle:', bundlePath);
    const bundle = await Deno.readTextFile(bundlePath);
    console.log('[extractInlineSourceMap] Bundle read, length:', bundle.length);
    const match = bundle.match(/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/);
    if (!match) {
      console.warn('[extractInlineSourceMap] No inline source map regex match.');
      return null;
    }
    console.log('[extractInlineSourceMap] Inline source map regex matched.');
    let rawMap;
    try {
      rawMap = atob(match[1]);
      console.log('[extractInlineSourceMap] Base64 decode success, length:', rawMap.length);
    } catch (e) {
      console.error('[extractInlineSourceMap] Base64 decode failed:', e);
      return null;
    }
    try {
      const parsed = JSON.parse(rawMap);
      console.log('[extractInlineSourceMap] JSON parse success. sources:', parsed.sources);
      return parsed;
    } catch (e) {
      console.error('[extractInlineSourceMap] JSON parse failed:', e);
      return null;
    }
  } catch (error) {
    console.error(`[extractInlineSourceMap] Failed to extract source map from ${bundlePath}:`, error);
    return null;
  }
}

/**
 * Maps a JS/TS stack trace to original HQL locations using the inline source map.
 * Returns the remapped stack trace as a string.
 */
// Utility: Brute-force mapping for a given line, for diagnostics
async function logSourceMapMappings(sourceMap: any, lines: number[] = [116, 117, 118], maxCol: number = 80) {
  const { SourceMapConsumer } = await import('source-map');
  const consumer = await new SourceMapConsumer(sourceMap);
  for (const line of lines) {
    for (let c = 0; c <= maxCol; c++) {
      const orig = consumer.originalPositionFor({ line, column: c });
      if (orig && orig.source) {
        console.log(`[logSourceMapMappings] JS (${line},${c}) => HQL (${orig.source}:${orig.line}:${orig.column})`);
      }
    }
  }
  consumer.destroy();
}

export async function mapStackTraceToHql(error: Error, bundlePath: string): Promise<string> {
  if (!error.stack) return "";

  const sourceMap = await extractInlineSourceMap(bundlePath);
  if (!sourceMap) return error.stack;
  console.log('[mapStackTraceToHql] sourceMap.sources:', sourceMap.sources);
  // Brute-force mapping for diagnostics (lines 116, 117, 118; columns 0-80)
  await logSourceMapMappings(sourceMap, [116, 117, 118], 80);
  
  try {
    const consumer = await new SourceMapConsumer(sourceMap);
    
    const lines = error.stack.split('\n');
    const remapped = lines.map(line => {
      // Robust regex to match stack trace lines
      const match = line.match(/at (.+ )?\(?(.+):(\d+):(\d+)\)?/);
      if (match) {
        const fnName = match[1] ? match[1].trim() : undefined;
        const filePath = match[2];
        const lineNum = parseInt(match[3], 10);
        let colNum = parseInt(match[4], 10);
        let orig = null;
        let found = false;
        // Try all columns from colNum down to 0
        for (let c = colNum; c >= 0; c--) {
          console.log(`[mapStackTraceToHql] Trying mapping for line ${lineNum}, column ${c}`);
          orig = consumer.originalPositionFor({ line: lineNum, column: c });
          console.log(`[mapStackTraceToHql] Result for (${lineNum}, ${c}):`, orig);
          if (orig && orig.source) {
            found = true;
            break;
          }
        }
        if (found && orig && orig.source) {
          // Clean up source path if possible
          let src = orig.source.replace(/^\.*?\/doc\//, "doc/");
          src = src.replace(/^\.\//, "");
          if (fnName) {
            return `at ${fnName} (${src}:${orig.line}:${orig.column || 0})`;
          } else {
            return `at ${src}:${orig.line}:${orig.column || 0}`;
          }
        }
      }
      // Not matched or not remapped
      return line;
    });
    
    consumer.destroy();
    return remapped.join('\n');
  } catch (error) {
    console.error("Error while mapping stack trace:", error);
    return error.stack;
  }
}