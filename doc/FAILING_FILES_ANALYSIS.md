# Analysis of 18 Failing Test Files

## Category 1: Missing JS/TS Files (7 files)
These HQL files try to import JS/TS files that don't exist in the project:

1. **circular-dependency/case1-hql-entry/entry.hql**
   - Missing: `middle.js`
   - Error: "No such file or directory"

2. **import-test/deep-level1.hql**
   - Missing: `deep-level3.ts` (referenced from deep-level2.js)
   - Error: "Module not found"

3. **import-test/deep-nesting.hql**  
   - Missing: `deep-level3.ts` (referenced from deep-level2.js)
   - Error: "Module not found"

4. **test-complex-imports/entry.hql**
   - Missing: `utils.ts` (referenced from helper.js)
   - Error: "Module not found"

5. **test-complex-imports/extreme-test/entry.hql**
   - Missing: `ts-module.ts` (referenced from ts-js-bridge.ts)
   - Error: "Module not found"

6. **test-complex-imports/mixed/entry.hql**
   - Missing: `utils.ts` (referenced from helper.js)
   - Error: "Module not found"

7. **test-complex-imports/nested/b/d/f/f-module.hql**
   - Issue: Wrong import path `../../../../../nested/a/a-module.hql`
   - Error: "Could not resolve import"

## Category 2: Wrong Export/Import Names (6 files)
These files try to import a symbol that doesn't exist in the target module:

1. **import-test/hql-imports-js.hql**
   - Trying to import: `baseJsFunction` from `./base.js`
   - Actually exports: `baseHqlFunction`

2. **import-test/hql-imports-ts.hql**
   - Trying to import: `baseJsFunction` from `./base.js`
   - Actually exports: `baseHqlFunction`

3. **import-test/intermediate.hql**
   - Trying to import: `baseJsFunction` from `./base.js`
   - Actually exports: `baseHqlFunction`

4. **import-test/nested-imports.hql**
   - Trying to import: `baseJsFunction` from `./base.js`
   - Actually exports: `baseHqlFunction`

5. **test-complex-imports/nested/b/b-module.hql**
   - Trying to import: `eFunction` from `./e/e-module.hql`
   - Symbol not found

6. **test-complex-imports/nested/b/d/d-module.hql**
   - Trying to import: `fFunction` from `./f/f-module.hql`
   - Symbol not found

## Category 3: Runtime Error (1 file)
This file runs but fails at runtime:

1. **import-test/namespace-imports.hql**
   - Runtime error: "jsModule.baseJsFunction is not a function"
   - The file actually prints output before failing

## Category 4: Network/Lock File Issues (4 files)
These files fail due to remote import integrity checks:

1. **import-test/complex-imports.hql**
   - Issue: Lodash integrity check failed
   - Error: "Actual hash doesn't match expected hash in lock file"

2. **import-test/deep-level4.hql**
   - Issue: Lodash integrity check failed
   - Error: Same as above

3. **import-test/remote-imports.hql**
   - Issue: Lodash integrity check failed
   - Error: Same as above

4. **test-complex-imports/nested/entry.hql**
   - Trying to import: `cFunction` from `./c/c-module.hql`
   - Symbol not found

## Summary

- **7 files**: Missing JS/TS dependencies (test infrastructure issue)
- **6 files**: Wrong import/export names (test data issue)
- **1 file**: Runtime error (partially works)
- **4 files**: Network/lock file issues (environment issue)

**None of these are HQL syntax errors.** They are all:
1. Missing test fixtures (JS/TS files that should exist for the test)
2. Mismatched import/export names in test data
3. Network/environment issues with remote imports

## Recommendation

These appear to be incomplete test cases or test infrastructure issues, not actual HQL language bugs. They could be:
1. Tests for error handling (intentionally broken)
2. Incomplete test setup (missing supporting files)
3. Outdated tests from previous versions

Consider either:
- Adding the missing JS/TS files to make tests complete
- Moving these to a separate "integration-tests" folder
- Marking them as "known-incomplete" tests