# HQL Error System Documentation

## Current Status

HQL currently implements a structured error handling system through the `error-pipeline.ts` module, which provides:

1. Standardized error collection, processing, and reporting
2. Error messages with file path, line, and column information
3. Separation of core error info and debug details
4. Support for specialized error types (Parse, Import, Validation, etc.)

However, the current system has limitations when showing errors for HQL code:

1. Error positions often point to transpiled JavaScript code rather than the original HQL source
2. For HQL files, there's an attempt to extract HQL file information from stack traces, but this approach is not comprehensive
3. Error handling is fragmented across different parts of the codebase without a unified approach
4. Limited use of source maps or other mechanisms to map transpiled JS errors back to HQL source

### Current Error Display Issues

Here's an example of how errors are currently displayed with the transpiled JavaScript locations:

```
[ERROR] TypeError: Cannot read property 'value' of undefined
    at /tmp/hql_temp_3f9d8a2b/main.js:42:28
    at Array.map (native)
    at Object.execute (/tmp/hql_temp_3f9d8b2c/main.js:41:14)
    at runHQL (/Users/user/.deno/bin/hql:157:20)

Error in your HQL code: Cannot read property 'value' of undefined
Suggestion: Check that all variables are properly initialized before use.
For more details, run with --debug flag.
```

The key issues here are:

1. The error points to `/tmp/hql_temp_3f9d8a2b/main.js:42:28`, which is a temporary transpiled file
2. There's no reference to the original HQL file, line, or column
3. The context of the error (surrounding code) is missing
4. Original HQL code isn't shown, making debugging difficult
5. The error message is generic and lacks specificity

## Future Direction

### Goals

1. **Precise Error Reporting**: Show exact error locations in HQL source files, not in transpiled JS
2. **Deno-Level Error Quality**: Provide error messages with the same level of detail as Deno's JS/TS error reporting
3. **Unified Error System**: Consolidate error handling across the entire project
4. **Multi-Language Support**: Handle errors consistently across .hql, .js, and .ts files
5. **Developer-Friendly Diagnostics**: Make debugging HQL applications easier with clear, actionable error messages

### Improved Error Display

After implementing source maps and enhancing error reporting, errors will be displayed like this:

```
TypeError: Cannot read property 'value' of undefined
    at getUserData (/Users/user/project/app.hql:15:22)

Error in app.hql:15:22

   13 | (fn getUserData (userId)
   14 |   (let (user (findUserById userId)
 -> 15 |        name user.value.name)
      |                     ^
   16 |     name))
   17 | 

Suggestion: Check that 'user' contains the expected structure with a 'value' property before accessing it.
Try adding a check: (if user (get user "value") null)

For more debugging info, run with --debug flag.
```

Key improvements:

1. Direct reference to original HQL file, line, and column
2. Context showing the surrounding HQL code
3. Visual pointer (^) showing exact error position
4. Specific error message that relates to the HQL code
5. Actionable suggestion with HQL-specific syntax
6. Clean, readable formatting similar to Deno's error messages

### Technical Approach

#### Source Map Integration

We will implement proper source map generation during the HQL transpilation process. This will:

- Map transpiled JavaScript locations back to original HQL source positions
- Allow error stacks to reference HQL source files with correct line and column numbers
- Preserve original source context for error reporting

**Current vs Future Mapping Process:**

```
# Current Process
HQL Source (.hql) → Transpiled JS (.js) → Error (JS location)
                                           ↓
                            Manual extraction from stack trace
                                           ↓
                          Approximate HQL location (often incorrect)

# Future Process with Source Maps
HQL Source (.hql) → Transpiled JS (.js) + Source Map (.js.map) → Error (JS location)
                                                                  ↓
                                                       Source Map Consumption
                                                                  ↓
                                                    Exact HQL location & context
```

#### Error Handler Enhancement

1. **Error Interceptor**: Create a global error handler that intercepts all errors during HQL execution
2. **Source Map Resolution**: Use generated source maps to transform JS stack traces to HQL stack traces
3. **Context Preservation**: Keep original HQL source content for showing relevant code snippets around errors
4. **File Type Detection**: Implement smart error handling based on file extension (.hql, .js, .ts)

#### Unified API

Develop a consolidated API for error handling with:

1. **Error Factory**: Create appropriate error types with correct source locations
2. **Error Reporter**: Format and output errors consistently across the application
3. **Error Recovery**: Provide mechanisms for graceful handling of certain error types
4. **Error Transformation**: Convert errors from one domain (JS runtime) to another (HQL semantic)

#### Multi-Language Support Comparison

```
# .hql file error (after improvements)
SyntaxError: Unexpected token in app.hql:23:8

   21 | (fn calculate (x y)
   22 |   (let (result (+ x y))
-> 23 |     (if result = 0
      |           ^
   24 |       "Zero"
   25 |       result)))

Suggestion: Use '===' for equality comparison: (if (=== result 0) ...)

# .js file error (unchanged Deno error)
SyntaxError: Unexpected token in lib.js:18:11

   16 | function calculate(x, y) {
   17 |   const result = x + y;
-> 18 |   if (result = 0) {
      |            ^
   19 |     return "Zero";
   20 |   }

# .ts file error (unchanged Deno error)
TS2322 [ERROR]: Type 'string' is not assignable to type 'number' in utils.ts:15:14

   13 | function multiply(a: number, b: number): number {
   14 |   const result = a * b;
-> 15 |   return "" + result;
      |          ^^^^^^^^^^^^
   16 | }
   17 | 
```

### Implementation Phases

1. **Phase 1**: Implement source map generation in the HQL transpiler
2. **Phase 2**: Enhance error handler to use source maps for location mapping
3. **Phase 3**: Consolidate error handling across the project
4. **Phase 4**: Implement specialized handling for different file types
5. **Phase 5**: Add user-friendly suggestions and recovery options

## Implementation Considerations

### Source Maps

Source maps provide a standardized way to map transpiled/bundled code back to original source. For HQL, we need to:

1. Generate source maps during transpilation
2. Register these source maps with Deno's error handling system
3. Ensure source maps are kept in memory for development environments
4. Optionally include source maps in production builds (configurable)

#### Source Map Integration Architecture

```
┌────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│                │     │                 │     │                     │
│  HQL Source    │────▶│  HQL Transpiler │────▶│  JavaScript + Maps  │
│                │     │                 │     │                     │
└────────────────┘     └─────────────────┘     └──────────┬──────────┘
                                                          │
                                                          ▼
┌────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│                │     │                 │     │                     │
│  Error Handler │◀────│  Runtime Error  │◀────│  JavaScript Runtime │
│                │     │                 │     │                     │
└───────┬────────┘     └─────────────────┘     └─────────────────────┘
        │
        │  Source Map Resolution
        ▼
┌────────────────┐
│                │
│  HQL Error     │
│  Display       │
│                │
└────────────────┘
```

### Error Classification

Errors should be classified into:

- **Syntax Errors**: Issues in HQL syntax before transpilation
- **Semantic Errors**: Type mismatches, undefined variables, etc.
- **Runtime Errors**: Exceptions during execution of transpiled code
- **System Errors**: Failures in the HQL tooling itself

#### Example Error Display by Category:

**Syntax Error:**
```
SyntaxError in calculator.hql:10:12
Unexpected token ')'

    8 | (fn add (x y)
    9 |   (+ x y))
-> 10 | (fn sub (x y))
       |            ^
   11 | (- x y))
   12 | 

Suggestion: Check for mismatched parentheses. You may be missing an opening '(' or have an extra ')'.
```

**Semantic Error:**
```
TypeError in user-service.hql:25:18
Cannot call function 'calculate' with a string argument

   23 | (fn process-user (user)
   24 |   (let (score (get user "score")
-> 25 |         total (calculate score "bonus"))
       |                  ^^^^^^^^^^^^^^^^^^^^^
   26 |     total))
   27 | 

Suggestion: The 'calculate' function expects numeric arguments. Convert "bonus" to a number first.
```

**Runtime Error:**
```
RuntimeError in api-client.hql:42:8
Failed to fetch data: Network timeout

   40 | (fn get-data ()
   41 |   (try
-> 42 |     (fetch "https://api.example.com/data")
       |        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   43 |     (catch (e)
   44 |       (log "Error fetching data: " e))))

Suggestion: Check your network connection or the API endpoint URL.
```

**System Error:**
```
SystemError: Failed to transpile HQL module
Unable to resolve import './missing-module.hql' in /Users/user/project/main.hql

Suggestion: Verify that './missing-module.hql' exists in the correct location relative to main.hql.
```

### Error Format Standardization

Define a standard error format with:

- Error type and severity
- Precise source location (file, line, column)
- Contextual code snippet
- Helpful suggestion for fixing the issue
- Link to documentation (where applicable)

## Next Steps

1. Audit the current error handling implementation across the codebase
2. Implement source map generation in the transpiler
3. Enhance the error-pipeline.ts to use source maps
4. Consolidate error handling into a unified system
5. Improve error messages and suggestions
6. Add comprehensive tests for error reporting

## Leveraging Deno Infrastructure for HQL Error Handling

### Using Deno's Source Map Support

Deno has built-in source map support that we can leverage for HQL error handling:

1. **Source Map Generation and Consumption**
   - Deno uses the V8 engine's source map capabilities
   - We can generate source maps during HQL → JS transpilation
   - Deno's `Error.prepareStackTrace` can be used to map JS locations back to HQL

2. **Deno Error Inspector API**
   ```typescript
   // Example of integrating with Deno's error handling
   const errorMap = new Map<string, string>();
   
   // Register our source map with Deno
   Deno.core.registerSourceMapData(
     "file:///tmp/hql_temp_123/output.js",  // transpiled path
     "file:///original/path/source.hql",    // original path
     sourceMapJSON                          // source map JSON
   );
   ```

3. **Deno Test Integration**
   - HQL error tests can leverage Deno's testing infrastructure
   - Use Deno's assertion capabilities for validating error handling

### Multi-Language Support in HQL

The HQL project needs to handle three types of files seamlessly:

1. **HQL Files (.hql)**
   - Generate source maps during transpilation
   - Use custom error handler that maps JS errors back to HQL source
   - Add source context for better error messages

2. **JavaScript Files (.js)**
   - Direct pass-through to Deno's error handling
   - Allow importing HQL modules (with transpilation)
   - Allow being imported by HQL modules

3. **TypeScript Files (.ts)**
   - Use Deno's TypeScript compiler and error reporting
   - Enable bi-directional imports with HQL
   - Leverage TypeScript's type checking for error prevention

```
┌───────────────┐     ┌───────────────┐     ┌────────────────┐
│               │     │               │     │                │
│  .hql files   │────▶│  transpiler   │────▶│  .js + source  │
│               │     │    + maps     │     │      maps      │
└───────┬───────┘     └───────────────┘     └────────┬───────┘
        │                                            │
        │                                            │
        │       ┌───────────────┐                    │
        │       │               │                    │
        ├───────▶  .js files    │────────────────────┤
        │       │               │                    │
        │       └───────────────┘                    │
        │                                            │
        │       ┌───────────────┐                    │
        │       │               │                    │
        └───────▶  .ts files    │────────────────────┘
                │  (via Deno)   │
                └───────────────┘
                       ▲
                       │
                       │
                ┌──────┴──────┐
                │             │
                │  Deno TS    │
                │  Compiler   │
                │             │
                └─────────────┘
```

### Mixed-Language Import Resolution

The current HQL pipeline allows mixing HQL with JS and TS as follows:

1. **HQL importing JS/TS**:
   ```lisp
   ;; In an HQL file
   (import util "./utils.js")             ;; Direct import of JS
   (import formatter "./formatter.ts")    ;; Direct import of TS
   ```

2. **JS/TS importing HQL**:
   ```javascript
   // In a JavaScript file
   import { getData } from "./data.hql";  // Import from HQL
   ```

3. **Error Propagation**:
   - Errors from JS/TS modules imported in HQL should maintain their original Deno error format
   - Errors from HQL modules imported in JS/TS should be mapped back to HQL source

### Implementation Strategy

1. **File Type Detection**:
   - Use file extension to determine error handling approach
   - For `.hql` files, use our enhanced error pipeline with source maps
   - For `.js` and `.ts` files, defer to Deno's error handling

2. **Error Handler Integration**:
   ```typescript
   // Selective error handling based on file type
   function handleError(error) {
     const stackLines = error.stack?.split("\n") || [];
     const sourceFile = extractSourceFileFromStack(stackLines);
     
     if (sourceFile?.endsWith(".hql")) {
       return handleHqlError(error);
     } else if (sourceFile?.endsWith(".ts")) {
       return passToDenoTsErrorHandler(error);
     } else {
       return passToDenoJsErrorHandler(error);
     }
   }
   ```

## Comparison with Other Languages

### Deno (TypeScript/JavaScript)

Deno provides excellent error reporting with:
- Exact file, line, column information
- Syntax highlighting in error messages
- Code snippets showing error context
- Clear error categorization

HQL should aim to match this quality, with HQL-specific enhancements.

### Rust

Rust's error system provides:
- Detailed error explanations
- Suggestions for fixing errors
- Clear visual indicators of error positions

These are features worth adopting in the HQL error system.
