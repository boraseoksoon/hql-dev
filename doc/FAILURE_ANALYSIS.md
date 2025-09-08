# HQL Test Failure Analysis

## Total: 23 Failed Examples (Updated after fixes)

### Fixed Issues:
- ✅ Import typo in `circular-dependency/case1-hql-entry/entry.hql` - FIXED
- ✅ Let syntax errors in 5 nested module files - ALL FIXED
- ✅ Function parameter syntax (3 files) - FIXED (removed anonymous functions)

### Discovered Core Limitation:
**Anonymous functions are not currently supported in HQL.** The syntax `(fn (x) ...)` without a name causes "Invalid fn syntax: function name must be a symbol" error. This affects any code trying to use inline anonymous functions with map, filter, reduce, etc.

## Remaining Issues After Fixes: 18 Failed Examples

### 1. **Syntax Errors (Real Bugs to Fix) - 7 files**

#### a. Invalid import syntax (1 file)
- `circular-dependency/case1-hql-entry/entry.hql`
  - **Error**: `(import [middle_js]s from "./middle.js")` - typo, extra 's' after closing bracket
  - **Fix needed**: Remove the 's'

#### b. Invalid let syntax (5 files) 
- `test-complex-imports/nested/a/a-module.hql`
- `test-complex-imports/nested/b/c/c-module.hql`
- `test-complex-imports/nested/b/d/e/e-module.hql`
- `test-complex-imports/nested/b/d/f/f-module.hql`
- `test-complex-imports/nested/a/deep-function.hql`
  - **Error**: `(let ((cValue (cFunction)))` - using double parentheses
  - **Fix needed**: Should be `(let [cValue (cFunction)]` with vector notation

#### c. Invalid fn syntax (1 file)
- `import-test/complex-imports.hql`
  - **Error**: "function name must be a symbol"
  - **Need to check**: File content to see actual syntax issue

### 2. **Missing JS/TS Dependencies (8 files)**
These are testing complex multi-language import graphs where JS/TS files are missing or misconfigured:

- `import-test/deep-level1.hql` - Can't find `deep-level3.ts`
- `import-test/deep-nesting.hql` - Can't find `deep-level3.ts`
- `test-complex-imports/entry.hql` - Can't find `utils.ts`
- `test-complex-imports/extreme-test/entry.hql` - Can't find `ts-module.ts`
- `test-complex-imports/mixed/entry.hql` - Can't find `utils.ts`
- `import-test/utility.hql` - Has fn syntax error (likely comma issue we already fixed)
- `import-test/remote-imports.hql` - Has fn syntax error
- `import-test/deep-level4.hql` - Lodash integrity check failed (network/cache issue)

### 3. **Wrong Import References (7 files)**
These files try to import symbols that don't exist in the target module:

- `import-test/hql-imports-js.hql` - Trying to import 'baseJsFunction' from JS but it doesn't export that
- `import-test/hql-imports-ts.hql` - Same issue
- `import-test/intermediate.hql` - Same issue
- `import-test/nested-imports.hql` - Same issue
- `test-complex-imports/nested/b/b-module.hql` - Can't find 'eFunction' 
- `test-complex-imports/nested/b/d/d-module.hql` - Can't find 'fFunction'
- `test-complex-imports/nested/entry.hql` - Can't find 'cFunction'

### 4. **Actually Works (1 file)**
- `import-test/namespace-imports.hql` - This actually runs successfully, just prints output

## Summary by Category

1. **Real HQL syntax bugs to fix**: 7 files
   - Import typo: 1
   - Let syntax errors: 5  
   - Function syntax error: 1

2. **Test infrastructure issues**: 15 files
   - Missing JS/TS files: 8
   - Wrong export/import names: 7

3. **Works but listed as fail**: 1 file

## Conclusion

Out of 23 failures:
- **7 are real bugs** in the example code (syntax errors)
- **15 are test infrastructure issues** (missing files, wrong imports)
- **1 actually works**

These are NOT "negative tests" (intentionally failing tests) - they're broken examples that need fixing. The issues are:
1. Outdated syntax (double parens in let)
2. Typos in import statements
3. Missing supporting JS/TS files for complex import tests
4. Mismatched import/export names