# HQL Error Handling System

## Overview

The HQL error handling system provides enhanced error reporting throughout the transpiler pipeline. It enriches error messages with source context, line highlighting, and helpful suggestions to guide users in fixing issues.

## Key Features

- **Source Context**: Shows code snippets around error locations
- **Line Highlighting**: Highlights the exact line where errors occur
- **Intelligent Suggestions**: Provides likely solutions based on error types
- **TypeScript Error Translation**: Converts cryptic TypeScript errors into clear messages
- **Consistent Error Format**: Standardizes how errors are reported across the system
- **Minimal Runtime Overhead**: Designed for efficiency with negligible impact on performance

## Architecture

The error handling system consists of several coordinated modules:

1. **Core Error Classes** (`errors.ts`): Defines the base error types used throughout the system.
2. **Enhanced Error Formatting** (`enhanced-errors.ts`): Adds source context and formatting to errors.
3. **TypeScript Error Translation** (`typescript-error-translator.ts`): Converts TypeScript error codes to readable messages.
4. **Unified Error Handling** (`error-handling.ts`): Central module that integrates all error handling features.
5. **Error Initializer** (`error-initializer.ts`): Sets up error handling throughout the system.
6. **Integration Module** (`integration.ts`): Connects error handling to the transpiler pipeline.

## Usage

### Basic Setup

To enable enhanced error handling throughout the system:

```typescript
import { initializeErrorHandling } from "./error-initializer.ts";

// Initialize at application startup
initializeErrorHandling();
```

### Wrapping Functions with Error Handling

To add error handling to any function:

```typescript
import { withErrorHandling } from "./error-handling.ts";

const safeFunction = withErrorHandling(
  originalFunction,
  { context: "descriptive context" }
);

// Now use safeFunction instead of originalFunction
```

### Registering Source Files

To enable source context in error messages:

```typescript
import { registerSourceFile } from "./error-handling.ts";

// Register a source file early in the processing pipeline
registerSourceFile("path/to/file.hql", sourceCode);
```

### Enhancing Errors Manually

```typescript
import { enhanceError, formatError } from "./error-handling.ts";

try {
  // Some operation that might fail
} catch (error) {
  if (error instanceof Error) {
    const enhanced = enhanceError(error, { 
      source: sourceCode,
      filePath: "path/to/file.hql"
    });
    console.error(formatError(enhanced));
  }
  throw error;
}
```

## Error Types

The system handles specialized error types for different parts of the transpiler:

- **TranspilerError**: Base class for all transpiler errors
- **ParseError**: Errors during parsing with position information
- **MacroError**: Errors during macro expansion
- **ImportError**: Errors processing imports
- **ValidationError**: Type validation errors
- **TransformError**: Errors during AST transformation
- **CodeGenError**: Errors during code generation

## Integration Points

The error handling system integrates at several key points:

1. **Parser**: Enhances parse errors with line context
2. **TypeScript Generation**: Translates TypeScript errors
3. **REPL**: Shows friendly errors during interactive use
4. **Transpiler Pipeline**: Each stage has error enhancement
5. **Process-Level**: Catches uncaught exceptions

## Contributing

When adding new error types or handling:

1. Define error classes in `errors.ts`
2. Add enhancement logic in `enhanced-errors.ts`
3. Register translations in `typescript-error-translator.ts` if needed
4. Update documentation

## Future Improvements

- Support for more language-specific error types
- Interactive error resolution in the REPL
- Integration with editor tools for in-editor error highlighting
- Machine learning-based error suggestions
- Performance optimization for large files 