# Enhanced Error Handling for HQL

The HQL language features a comprehensive error handling system designed to provide clear, actionable error messages with contextual information and suggestions.

## Features

- **Context-rich error messages**: Shows exact line and column numbers with source code context
- **Clickable file paths**: Directly navigate to error locations in supported editors
- **Intelligent suggestions**: Provides recommendations based on error type
- **Enhanced formatting in verbose mode**: Better visualization of errors with source context
- **Unified error reporting**: Consistent error presentation across all tools

## Usage

All CLI tools (`run.ts`, `transpile.ts`, `repl.ts`) automatically include enhanced error handling. You can customize error reporting with these flags:

| Flag | Description |
|------|-------------|
| `--debug` | Enable detailed error reporting with contextual information |
| `--verbose` | Show verbose output with enhanced formatting and stack traces |
| `--no-clickable-paths` | Disable clickable file paths in error messages |

## Example Commands

```bash
# Run a file with enhanced error reporting
deno run -A cli/run.ts ./my-file.hql --debug

# Transpile a file with enhanced error formatting
deno run -A cli/transpile.ts ./my-file.hql --verbose

# Use the dedicated error reporting tool for detailed analysis
deno run -A cli/error-report.ts ./my-file.hql
```

## Example Error Output

With `--verbose` mode:

```
┌───────────────────────────────────────────────────────────┐
│ HQL Error                                                 │
├───────────────────────────────────────────────────────────┤
│ Unclosed list                                             │
│ Location: /path/to/file.hql:1:14                          │
│                                                           │
│ 1 │ (fn add (a b) (+ a z)                                 │
│                    ^                                      │
│                                                           │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────────┐
│ Suggestion                                                            │
├───────────────────────────────────────────────────────────────────────┤
│ Check for missing closing parenthesis or closing braces in your code. │
└───────────────────────────────────────────────────────────────────────┘
```

## Error Reporter Tool

The `error-report.ts` tool is a dedicated utility for analyzing HQL files and providing detailed error information:

```bash
deno run -A cli/error-report.ts ./my-file.hql [options]
```

Options:
- `--verbose`: Show verbose details with enhanced formatting
- `--debug`: Same as `--verbose` but with more details
- `--no-clickable-paths`: Disable clickable file paths

## Integration in Development Environments

Clickable paths work in many modern editors and terminals, allowing you to jump directly to the error location. The format is compatible with:

- Visual Studio Code
- JetBrains IDEs (IntelliJ, WebStorm, etc.)
- iTerm2
- Modern terminal emulators supporting hyperlinks

## For Developers

The error handling system is implemented across several modules:

- `src/error-handling.ts`: Core error handling functionality
- `src/error-reporter.ts`: Unified error reporting interface
- `src/transpiler/enhanced-errors.ts`: Enhanced error classes
- `cli/error-report.ts`: Dedicated error reporting tool

To extend the error handling system, you can:

1. Add new error types in `src/transpiler/errors.ts`
2. Add corresponding suggestions in `src/error-handling.ts`
3. Update the formatters in `src/error-reporter.ts` as needed 