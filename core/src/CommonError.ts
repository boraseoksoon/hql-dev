// CommonError.ts - Centralized error handling utilities for HQL

import { Logger } from "./logger.ts";

// ---- Error Types ----
export class TranspilerError extends Error {
  public source?: string;
  public filePath?: string;
  public line?: number;
  public column?: number;
  public contextLines: string[] = [];

  constructor(
    message: string,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
    } = {}
  ) {
    super(message);
    this.source = options.source;
    this.filePath = options.filePath;
    this.line = options.line;
    this.column = options.column;
  }

  static fromError(error: Error, options: {
    source?: string;
    filePath?: string;
    line?: number;
    column?: number;
  } = {}): TranspilerError {
    return new TranspilerError(error.message, options);
  }
}

// ---- Error Formatting ----
export function formatError(
  error: Error,
  options: {
    filePath?: string;
    useColors?: boolean;
    includeStack?: boolean;
    makePathsClickable?: boolean;
  } = {}
): string {
  let result = error.message;
  if (options.includeStack && error.stack) {
    result += `\n\n${error.stack.split('\n').slice(1).join('\n')}`;
  }
  return result;
}

// ---- Error Reporting ----
export function reportError(
  error: Error,
  options: {
    filePath?: string;
    verbose?: boolean;
    useClickablePaths?: boolean;
    includeStack?: boolean;
  } = {}
): void {
  const formatted = formatError(error, {
    filePath: options.filePath,
    useColors: true,
    includeStack: options.includeStack,
    makePathsClickable: options.useClickablePaths,
  });
  if (options.verbose) {
    console.error("\x1b[31m[VERBOSE ERROR]\x1b[0m", formatted);
  } else {
    console.error("\x1b[31m[ERROR]\x1b[0m", formatted);
  }
}

// ---- Error Initialization ----
export function initializeErrorHandling(opts: {
  enableGlobalHandlers?: boolean;
  enableReplEnhancement?: boolean;
} = {}) {
  if (opts.enableGlobalHandlers) {
    globalThis.addEventListener?.("unhandledrejection", (e: any) => {
      reportError(e.reason || e, { includeStack: true });
    });
    globalThis.addEventListener?.("error", (e: any) => {
      reportError(e.error || e, { includeStack: true });
    });
  }
}

// ---- Error Context Utilities ----
const sourceRegistry = new Map<string, string>();
export function registerSourceFile(filePath: string, source: string) {
  sourceRegistry.set(filePath, source);
}
export function getSourceFile(filePath: string): string | undefined {
  return sourceRegistry.get(filePath);
}

// ---- Error Handling Wrapper ----
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T> | T,
  options: {
    source?: string;
    filePath?: string;
    context?: string;
    rethrow?: boolean;
    logErrors?: boolean;
  } = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (options.logErrors !== false) {
        reportError(error instanceof Error ? error : new Error(String(error)), {
          filePath: options.filePath,
          verbose: true,
          includeStack: true,
        });
      }
      if (options.rethrow !== false) throw error;
      return undefined as unknown as T;
    }
  };
}

// ---- Suggestions (stub) ----
export function getSuggestion(_error: Error): string | undefined {
  // TODO: Implement suggestion logic
  return undefined;
}

// ---- Export all as CommonError ----
const CommonError = {
  TranspilerError,
  formatError,
  reportError,
  initializeErrorHandling,
  registerSourceFile,
  getSourceFile,
  withErrorHandling,
  getSuggestion,
};
export default CommonError;
