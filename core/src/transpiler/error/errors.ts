// src/transpiler/errors.ts

import * as CommonError from '../../CommonError.ts';

// Re-export all types
export type ColorFn = CommonError.ColorFn;
export interface ColorConfig extends CommonError.ColorConfig {}

// Re-export all classes
export class BaseError extends CommonError.BaseError {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, BaseError.prototype);
  }
}

export class BaseParseError extends CommonError.BaseParseError {
  constructor(
    message: string,
    position: { line: number; column: number; offset: number },
    source?: string,
  ) {
    super(message, position, source);
    Object.setPrototypeOf(this, BaseParseError.prototype);
  }
}

export class TranspilerError extends CommonError.TranspilerError {
  constructor(
    message: string,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ) {
    super(message, options);
    Object.setPrototypeOf(this, TranspilerError.prototype);
  }
  
  static fromError(
    error: Error,
    options: {
      source?: string;
      filePath?: string;
      line?: number;
      column?: number;
      useColors?: boolean;
    } = {}
  ): TranspilerError {
    return CommonError.TranspilerError.fromError(error, options) as TranspilerError;
  }
}

export class ParseError extends CommonError.ParseError {
  constructor(
    message: string,
    position: { line: number; column: number; offset: number },
    source?: string,
    useColors: boolean = true
  ) {
    super(message, position, source, useColors);
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export class MacroError extends CommonError.MacroError {
  constructor(
    message: string,
    macroName: string,
    sourceFile?: string,
    originalError?: Error,
  ) {
    super(message, macroName, {
      sourceFile,
      originalError
    });
    Object.setPrototypeOf(this, MacroError.prototype);
  }
}

export class ImportError extends CommonError.ImportError {
  constructor(
    message: string,
    importPath: string,
    sourceFile?: string,
    originalError?: Error,
  ) {
    super(message, importPath, {
      sourceFile,
      originalError
    });
    Object.setPrototypeOf(this, ImportError.prototype);
  }
}

export class TransformError extends CommonError.TransformError {
  constructor(
    message: string,
    nodeSummary: string,
    phase: string,
    originalNode?: unknown,
  ) {
    super(message, nodeSummary, phase, {
      originalNode
    });
    Object.setPrototypeOf(this, TransformError.prototype);
  }
}

export class CodeGenError extends CommonError.CodeGenError {
  constructor(
    message: string,
    nodeType: string,
    originalNode?: unknown
  ) {
    super(message, nodeType, {
      originalNode
    });
    Object.setPrototypeOf(this, CodeGenError.prototype);
  }
}

export class ValidationError extends CommonError.ValidationError {
  constructor(
    message: string,
    context: string,
    expectedType?: string,
    actualType?: string,
  ) {
    super(message, context, {
      expectedType,
      actualType
    });
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export const createColorConfig = CommonError.createColorConfig;
export const summarizeNode = CommonError.summarizeNode;
export const formatValue = CommonError.formatValue;
export const createErrorReport = CommonError.createErrorReport;
export const parseError = CommonError.parseError;
export const formatError = CommonError.formatError;
export const report = CommonError.report;
export const reportError = CommonError.reportError;
export const registerSourceFile = CommonError.registerSourceFile;
export const getSourceFile = CommonError.getSourceFile;
export const withErrorHandling = CommonError.withErrorHandling;
export const withTypeScriptErrorTranslation = CommonError.withTypeScriptErrorTranslation;

export default CommonError;