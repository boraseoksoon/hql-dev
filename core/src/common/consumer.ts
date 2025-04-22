// consumer.ts - Source map stack trace consumer for HQL -> JS/TS error mapping

import { SourceMapConsumer } from "npm:source-map@0.7.4";
import { dirname, normalize, relative } from "https://deno.land/std@0.200.0/path/mod.ts";
import { globalLogger as logger } from "../logger.ts";

/**
 * Extracts the inline source map from a JS bundle file.
 * Returns the parsed source map object, or null if not found.
 */
export async function extractInlineSourceMap(bundlePath: string): Promise<any | null> {
  try {
    // console.log('[extractInlineSourceMap] Reading bundle:', bundlePath);
    logger.debug(`[extractInlineSourceMap] Reading bundle: ${bundlePath}`, 'source-map');
    const bundle = await Deno.readTextFile(bundlePath);
    // console.log('[extractInlineSourceMap] Bundle read, length:', bundle.length);
    logger.debug(`[extractInlineSourceMap] Bundle read, length: ${bundle.length}`, 'source-map');
    const match = bundle.match(/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/);
    if (!match) {
      console.warn('[extractInlineSourceMap] No inline source map regex match.');
      return null;
    }
    // console.log('[extractInlineSourceMap] Inline source map regex matched.');
    logger.debug('[extractInlineSourceMap] Inline source map regex matched.', 'source-map');
    const rawMap = atob(match[1]);
    // console.log('[extractInlineSourceMap] Base64 decode success, length:', rawMap.length);
    logger.debug(`[extractInlineSourceMap] Base64 decode success, length: ${rawMap.length}`, 'source-map');
    const parsed = JSON.parse(rawMap);
    // console.log('[extractInlineSourceMap] JSON parse success. sources:', parsed.sources);
    logger.debug(`[extractInlineSourceMap] JSON parse success. sources: ${parsed.sources}`, 'source-map');
    return parsed;
  } catch (error) {
    console.error(`[extractInlineSourceMap] Failed to extract source map from ${bundlePath}:`, error);
    return null;
  }
}

/**
 * Maps a JS/TS stack trace to original HQL locations using the inline source map.
 * Returns the remapped stack trace as a string.
 */
export async function mapStackTraceToHql(error: Error, bundlePath: string): Promise<string> {
  // console.log('[mapStackTraceToHql/DEBUG] Input:', { errorStack: error.stack, bundlePath });
  logger.debug(`[mapStackTraceToHql/DEBUG] Input: ${JSON.stringify({ errorStack: error.stack, bundlePath })}`, 'source-map');
  if (!error.stack) return "";

  const sourceMap = await extractInlineSourceMap(bundlePath);
  if (!sourceMap) {
    // console.log('[mapStackTraceToHql/DEBUG] No source map found for bundle:', bundlePath);
    logger.debug(`[mapStackTraceToHql/DEBUG] No source map found for bundle: ${bundlePath}`, 'source-map');
    return error.stack;
  }
  // console.log('[mapStackTraceToHql/DEBUG] Parsed sourceMap:', JSON.stringify(sourceMap, null, 2));
  logger.debug(`[mapStackTraceToHql/DEBUG] Parsed sourceMap: ${JSON.stringify(sourceMap, null, 2)}`, 'source-map');
  if (sourceMap.sourcesContent) {
    // console.log('[mapStackTraceToHql/DEBUG] sourceMap.sourcesContent:', sourceMap.sourcesContent.map((c: string, i: number) => `[${i}] ${c.slice(0, 60)}...`));
    logger.debug(`[mapStackTraceToHql/DEBUG] sourceMap.sourcesContent: ${sourceMap.sourcesContent.map((c: string, i: number) => `[${i}] ${c.slice(0, 60)}...`).join(', ')}`,'source-map');
  }

  const consumer = await new SourceMapConsumer(sourceMap);
  const cwd = Deno.cwd();
  const remapped: string[] = [];

  // A regex that captures optional function name, file URL/path, line and column
  const frameRegex = /^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/;

  for (const line of error.stack.split('\n')) {
    // console.log('[mapStackTraceToHql/DEBUG] Processing stack line:', line);
    logger.debug(`[mapStackTraceToHql/DEBUG] Processing stack line: ${line}`,'source-map');
    const m = line.match(frameRegex);
    if (m) {
      const fnName = m[1] || '';
      const filePath = m[2];
      const lineNum = Number(m[3]);
      const colNum = Number(m[4]);
      // console.log('[mapStackTraceToHql/DEBUG] Mapping JS frame:', { fnName, filePath, lineNum, colNum });
      logger.debug(`[mapStackTraceToHql/DEBUG] Mapping JS frame: ${JSON.stringify({ fnName, filePath, lineNum, colNum })}`,'source-map');

      // Try mapping at the reported column, fallback by decrementing if no source
      let orig = consumer.originalPositionFor({ line: lineNum, column: colNum });
      // console.log('[mapStackTraceToHql/DEBUG] Mapping result:', orig);
      logger.debug(`[mapStackTraceToHql/DEBUG] Mapping result: ${JSON.stringify(orig)}`,'source-map');
      if (!orig.source) {
        for (let c = colNum - 1; c >= 0; c--) {
          orig = consumer.originalPositionFor({ line: lineNum, column: c });
          // console.log(`[mapStackTraceToHql/DEBUG] Fallback mapping result for column ${c}:`, orig);
          logger.debug(`[mapStackTraceToHql/DEBUG] Fallback mapping result for column ${c}: ${JSON.stringify(orig)}`,'source-map');
          if (orig.source) break;
        }
      }

      if (orig.source) {
        // Normalize and relativize the source path
        let src = normalize(orig.source);
        src = relative(cwd, src) || src;
        // console.log('[mapStackTraceToHql/DEBUG] Final mapped source:', src, 'line:', orig.line, 'col:', orig.column);
        logger.debug(`[mapStackTraceToHql/DEBUG] Final mapped source: ${src} line: ${orig.line} col: ${orig.column}`,'source-map');
        const location = `${src}:${orig.line}:${orig.column ?? 0}`;
        remapped.push(fnName
          ? `at ${fnName} (${location})`
          : `at ${location}`
        );
        continue;
      } else {
        // console.log('[mapStackTraceToHql/DEBUG] No mapping found for frame:', { fnName, filePath, lineNum, colNum });
        logger.debug(`[mapStackTraceToHql/DEBUG] No mapping found for frame: ${JSON.stringify({ fnName, filePath, lineNum, colNum })}`,'source-map');
      }
    } else {
      // console.log('[mapStackTraceToHql/DEBUG] Stack line did not match frame regex:', line);
      logger.debug(`[mapStackTraceToHql/DEBUG] Stack line did not match frame regex: ${line}`,'source-map');
    }

    // If not matched or no mapping, keep original line
    remapped.push(line);
  }

  consumer.destroy();
  const result = remapped.join('\n');
  // console.log('[mapStackTraceToHql/DEBUG] Final remapped stack trace:', result);
  logger.debug(`[mapStackTraceToHql/DEBUG] Final remapped stack trace: ${result}`,'source-map');
  return result;
}
