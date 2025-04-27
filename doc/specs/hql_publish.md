# HQL Module Publishing System - Quick Reference

## Basic Usage

```bash
# Publish to JSR (default)
hql publish ./my-module

# Publish to NPM
hql publish ./my-module npm

# Publish to JSR with specific version
hql publish ./my-module jsr 1.2.3

# Publish to NPM with specific version
hql publish ./my-module npm 1.2.3

# Publish to both JSR and NPM
hql publish ./my-module all

# Dry run mode (no actual publishing)
hql publish ./my-module --dry-run
```

## Use Cases

### Case 1: Directory with only HQL file, no metadata files

```bash
hql publish ./jsr
```

**What happens:**
- System asks for package name
- System asks for version (defaults to 0.0.1)
- Creates jsr.json with this information
- Builds and publishes

### Case 2: Directory with only HQL file, specifying version

```bash
hql publish ./jsr npm 0.1.5
```

**What happens:**
- System asks for package name
- System uses 0.1.5 as default version in prompt
- Creates package.json with this information
- Builds and publishes to NPM

### Case 3: Directory with existing metadata (package.json/deno.json)

```bash
hql publish ./my-npm-package
```

**What happens:**
- Uses package name from metadata file
- Checks remote registry for latest version
- Increments latest version by 0.0.1
- Builds and publishes

### Case 4: Force specific version with existing metadata

```bash
hql publish ./my-jsr-package jsr 2.0.0
```

**What happens:**
- Uses package name from metadata file
- Uses 2.0.0 as version (skips remote registry check)
- Builds and publishes

## CLI Reference

```bash
hql publish <module-path> [platform] [version] [options]
```

| Parameter | Description | Values |
|-----------|-------------|--------|
| module-path | File or directory to publish | Required |
| platform | Target registry | jsr, npm, all (default: jsr) |
| version | Force specific version | X.Y.Z format |

**Options:**
- `--dry-run`: Test without publishing
- `--verbose`: Show detailed logs

## Environment Variables

- `DRY_RUN_PUBLISH=1`: Always use dry run mode
- `SKIP_LOGIN_CHECK=1`: Skip registry authentication checks
## Troubleshooting

### Authentication Issues

```bash
# For JSR authentication
deno login

# For NPM authentication
npm login

# Skip authentication checks
SKIP_LOGIN_CHECK=1 hql publish ./my-module
```

### Version Conflicts

If version already exists in registry:

```bash
# Force a specific higher version
hql publish ./my-module npm 1.2.4
```

## Package Structure

The system generates:
- For JSR: `jsr.json` with scoped name (@user/package)
- For NPM: `package.json` with appropriate fields
- JavaScript bundle and TypeScript definitions

## Entry Point Detection

The system automatically finds:
1. Specified file (if direct path provided)
2. `index.hql` in a directory
3. `index.js` or `index.ts` (fallbacks)

## Key Rules

1. **No Metadata Files**: System asks for both name and version
2. **With Metadata Files**: System uses name from file and auto-increments version
3. **CLI Version Override**: Always takes precedence over auto-versioning
