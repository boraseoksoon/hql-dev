# HQL Module Publishing System

## 🚀 Remote Registry-First Design (2025)

**As of April 2025, the HQL CLI always uses the remote registry (NPM or JSR) as the source of truth for package versions and publish permissions.**

- All version and permission checks are performed against the remote registry before publishing.
- Local registry logic has been removed for simplicity and reliability.
- The CLI fails early with clear errors if a version is already published or if the user lacks publish permission.
- All remote registry logic is implemented in `core/cli/publish/remote_registry.ts` and independently tested in `remote_registry.test.ts`.

### How it Works
1. **Version Check:** Before publishing, the CLI queries the remote registry for the latest version of the package.
2. **Permission Check:** The CLI checks if the user has permission to publish to the target package (NPM: best effort, JSR: always true for now).
3. **Early Exit:** If the version is already published or the user lacks permission, the CLI fails with a clear error message.
4. **Publishing:** If all checks pass, the package is published to the selected registry.

### Example Workflow
```bash
hql publish ./my-module npm
# → Checks latest version and permission on NPM before publishing

hql publish ./my-module jsr
# → Checks latest version and permission on JSR before publishing
```

### Technical Appendix
- **NPM:**
  - Latest version: `https://registry.npmjs.org/<package-name>`
  - Permission: Attempts to fetch package metadata and checks publishability
- **JSR:**
  - Latest version: `https://jsr.io/api/packages/<scope>/<name>`
  - Permission: Currently always returns true (no public API)

**Rationale:**
- Always using the remote registry ensures the CLI is robust, up-to-date, and user-friendly.
- This approach eliminates the risk of publishing stale or duplicate versions and provides immediate feedback on permission issues.

---

## Overview

The HQL Module Publishing System provides a robust, user-friendly mechanism for publishing HQL modules to multiple package registries (NPM, JSR) with minimal configuration requirements. The system is designed to intelligently handle various module types, automatically detect entry points, and generate self-contained ESM bundles with proper TypeScript type definitions.

## Core Philosophy

- **Minimal Configuration**: Publishers should be able to publish a module with zero or minimal configuration
- **Smart Defaults**: The system should intelligently determine defaults based on module structure
- **Platform Agnostic**: Support publishing to multiple package registries with the same codebase
- **Expression-Oriented**: Embrace HQL's expression-oriented programming style in publishing workflow
- **Self-Contained Output**: Generate a single, self-contained JavaScript bundle that can be easily distributed

## Features

- **Multiple Registry Support**: Publish to both NPM and JSR with the same codebase
- **Intelligent Entry Point Detection**: Automatically finds and processes the best entry point
- **Module Bundling**: Creates optimized, self-contained ESM bundles
- **TypeScript Definitions**: Automatically generates TypeScript type definitions
- **Dry-Run Mode**: Test publishing process without actually publishing
- **Flexible CLI Options**: Configure package name, version, and other options as needed
- **Environment Configuration**: Set default values through environment variables

## CLI Usage

```bash
# Basic usage (defaults to JSR registry)
deno run -A core/cli/publish.ts <module-path> [--dry-run]

# Publishing to JSR with explicit name/version
deno run -A core/cli/publish.ts <module-path> jsr <package-name> <version> [--dry-run]

# Publishing to NPM
deno run -A core/cli/publish.ts <module-path> npm <package-name> <version> [--dry-run]
```

### CLI Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<module-path>` | Path to the module to publish | Required |
| `<platform>` | Target platform (jsr/npm) | `jsr` |
| `<package-name>` | Package name | Auto-generated from directory name |
| `<version>` | Package version | Auto-incremented or `0.0.1` |
| `--dry-run` | Simulate publishing without actually publishing | `false` |

## Environment Variables

The publishing system supports the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DRY_RUN_PUBLISH` | Enable dry run mode globally | `false` |
| `SKIP_LOGIN_CHECK` | Skip authentication checks | `false` |
| `HQL_DEV` | Development mode with simplified checks | `false` |

## Smart Entry Point Detection

The system looks for entry points in the following order:

1. If `<module-path>` is a file, use it directly
2. If `<module-path>` is a directory, search for entry points in order:
   - `index.hql`
   - `index.js`
   - `index.ts`
   - Any file with the same name as the directory
   - The first `.hql` file found

## Architecture

The publishing system consists of several key components:

### Core Components

- **`publish.ts`**: Main CLI entry point with argument parsing and workflow orchestration
- **`build_js_module.ts`**: Module bundling and transpilation logic
- **`publish_npm.ts`**: NPM-specific publishing implementation
- **`publish_jsr.ts`**: JSR-specific publishing implementation
- **`publish_common.ts`**: Environment validation and shared utilities

### Build Process

1. **Entry Point Detection**: Identify the main file to process
2. **Environment Validation**: Check for necessary tools and configurations
3. **Transpilation**: Transform HQL/JS/TS code into an optimized bundle
4. **Distribution Preparation**: Create package structure with metadata
5. **Registry Publishing**: Send package to the appropriate registry

## Generated Package Structure

For each published module, the system creates the following structure:

```
dist/
├── README.md              # Auto-generated if not present
├── jsr.json or package.json  # Registry-specific configuration
├── esm/
│   └── index.js           # Main ESM bundle
└── types/
    └── index.d.ts         # TypeScript definitions
```

## Deployment

The transpiler maintains compatibility with JSR and NPM package structures, allowing developers to publish modules through either registry's native tools:

```bash
# Publishing with JSR
cd dist && deno publish

# Publishing with NPM
cd dist && npm publish
```

## Future Improvements

- Enhanced cross-platform support with more registry integrations
- More granular configuration options for advanced publishing scenarios
- Improved error messaging and diagnostics
- Comprehensive test suite for various module structures
- Better module dependency analysis and circular reference detection

## Known Limitations

- Circular dependencies can cause issues during bundling
- Complex HQL syntax might not always transpile correctly
- JavaScript and TypeScript module bundling requires additional testing
- Environment setup is currently biased toward Deno/JSR workflows

## Implementation Examples

The `/doc/examples/publish/` directory contains example modules showcasing different use cases:

- `hql/`: Basic HQL module with standard exports
- `js/`: JavaScript module example
- `ts/`: TypeScript module example
- `entry/`: Custom entry point module

## Common Issues and Solutions

### Version Management

When no version is specified, the system will:
1. Look for existing version in package configuration
2. Increment patch version if found
3. Use 0.0.1 as default for new packages

### Authentication

The system requires authenticated status with the target registry. Use:
- `deno login` for JSR publishing
- `npm login` for NPM publishing

Setting `SKIP_LOGIN_CHECK=1` bypasses these checks for development purposes.

## Contributing to the Publishing System

Contributions to the publishing system should focus on:

1. Maintaining backward compatibility with existing workflows
2. Improving the developer experience with better defaults
3. Enhancing cross-platform compatibility
4. Expanding testing coverage for diverse module types
5. Documenting edge cases and workarounds

## Conclusion

The HQL Module Publishing System provides a comprehensive, flexible approach to package publication with minimal configuration. By embracing intelligent defaults and streamlined workflows, it enables developers to focus on writing HQL code rather than managing complex publishing configurations.
