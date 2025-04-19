# HQL REPL Documentation

## Overview

The HQL REPL (Read-Eval-Print Loop) is designed to be a persistent, module-aware interactive environment for HQL development. Unlike traditional Lisp REPLs that reset state between sessions, the HQL REPL maintains state across sessions while providing intuitive organization through modules.

## Core Design Principles

1. **Persistent by Default**
   - All definitions, expressions, and imported functions persist across sessions
   - Automatic state saving after successful evaluations
   - Seamless restoration of previous state on startup

2. **Module-Based Organization**
   - Code naturally organized into modules
   - Clear module boundaries and dependency tracking
   - Intuitive module switching and management
   - Native HQL import/export syntax for module interaction

3. **Simple, Memorable Commands**
   - Minimal command set focused on common operations
   - Consistent command structure
   - No need to specify symbol types (variables, functions, etc.)

## Features

### Implemented Features

1. **Basic REPL Operations**
   - Expression evaluation
   - Function definition
   - Error handling and reporting
   - Command processing (`:help`, `:quit`, etc.)

2. **Environment Management**
   - Basic environment tracking
   - Symbol definition and lookup
   - Error context and source tracking

3. **Module System**
   - Current module display in prompt (`hql[module-name]>`)
   - Module switching via `:go <module-name>` (replaces older `:module` command)
   - Module listing with `:modules` or CLI-style `ls -m` and `ls -modules`
   - Module removal with `:remove module:<module-name>`
   - Automatic module creation on first use
   - Module-specific state management
   - Native HQL imports using `(import [symbol] from "module")`
   - Native HQL exports using `(export [symbol])`

4. **Persistence Layer**
   - Automatic state saving after evaluations
   - State restoration on startup
   - Project-specific state management
   - Version compatibility tracking

5. **Enhanced Commands**
   - `:see` - Powerful inspection of modules and symbols
   - `:list` - Show current module contents
   - `:remove <symbol>` - Remove individual symbol
   - `:remove module:<name>` - Remove an entire module
   - `:remove all` - Reset entire environment
   - `:write` - Open a text editor for multiline code editing

## Using the REPL

### Starting the REPL

Start the REPL using the Deno task:

```bash
deno task repl
```

You can also start it with various options:

```bash
deno task repl --verbose --js --ast --expanded
```

### Command-Line Options

| Option | Description |
|--------|-------------|
| `--verbose` | Enable verbose logging |
| `--quiet` | Disable console.log output |
| `--log <namespaces>` | Filter logging to specific namespaces |
| `--history <size>` | Set history size (default: 100) |
| `--load <file>` | Load and evaluate a file on startup |
| `--ast` | Show AST for expressions by default |
| `--expanded` | Show expanded forms by default |
| `--js` | Show JavaScript output by default |
| `--no-colors` | Disable colored output |

### Basic Usage

When you start the REPL, you'll see a prompt like this:

```
hql[user]>
```

The prompt shows the current module name in square brackets (`[user]` by default).

Type HQL expressions to evaluate them:

```
hql[user]> (+ 1 2)
3

hql[user]> (fn square (x) (* x x))
[Function: square]

hql[user]> (square 5)
25
```

All definitions are automatically saved and will be available in future REPL sessions.

### Working with Modules

Modules help organize your code. You can create and switch between modules:

```
hql[user]> :go math
Switched to module: math

hql[math]> (fn square (x) (* x x))
[Function: square]

hql[math]> (fn cube (x) (* x x x))
[Function: cube]

hql[math]> (cube 3)
27
```

You can switch back to another module:

```
hql[math]> :go user
Switched to module: user

hql[user]> 
```

#### Inspecting Modules and Symbols

List all available modules:

```
hql[user]> :see
Available Modules:
Module names:
------------
- user (3 symbols, 1 exports)
- math (2 symbols, 0 exports)
------------

Use :see <module> to view symbols in a specific module
Use :see <module:symbol> to view a specific symbol definition
```

List all definitions in a specific module:

```
hql[math]> :see math
Symbols in module 'math':
Symbol names:
------------
- cube
- square
------------

Use :see math:<symbol> to view a specific symbol definition
To use symbols from this module in HQL, import them with:
(import [symbol1, symbol2] from "math")
```

View a specific symbol's definition:

```
hql[user]> :see math:square
Definition of 'math:square':
----------------
function square(x) {
  return x * x;
}
----------------
To use this symbol in HQL, import it with:
(import [square] from "math")
----------------
```

#### Importing and Exporting 

Use native HQL syntax for imports and exports:

```
hql[user]> (import [square, cube] from "math")
[2 symbols imported]

hql[math]> (export [square])
square exported

hql[user]> (square 4)
16
```

You can view exports with the `:see` command:

```
hql[user]> :see math
Symbols in module 'math':
Symbol names:
------------
- cube
- square (exported)
------------
```

### Working with Multiline Code

You can write multiline code by starting an expression and pressing Enter when the parentheses aren't balanced:

```
hql[user]> (fn factorial (n)
  (if (= n 0)
    1
    (* n (factorial (- n 1)))))
[Function: factorial]
```

For more advanced multiline editing, use the `:write` command to open your text editor:

```
hql[user]> :write
Opening editor (vim)... Close the editor when finished.
```

This opens your default editor (set via EDITOR environment variable) where you can write complex code with proper indentation, then save and close to evaluate it in the REPL.

You can also edit existing symbols:

```
hql[user]> :write factorial
Opening editor (vim)... Close the editor when finished.
```

### Command Reference

#### Core Commands

| Command | Description |
|---------|-------------|
| `:help [command]` | Display help for a specific command or general help if no command provided |
| `:quit`, `:exit` | Exit the REPL |
| `:env` | Show environment bindings in the current module |
| `:macros` | Show defined macros |
| `:go [module]` | Switch to another module or show current if no module provided |
| `:modules` | List all available modules |
| `:list` | List all symbols in the current module |
| `:find [term]` | Search for symbols and modules |
| `:see [module/symbol]` | Inspect modules or specific symbols |
| `:doc [symbol]` | Show documentation for a symbol |
| `:remove [target]` | Remove a symbol, module, or reset everything |
| `:remove -f [target]` | Force remove without confirmation |
| `:cli` | Show available CLI shortcut commands |

#### CLI-Style Commands

HQL REPL provides Unix-like CLI commands for common operations:

| Command | Description | Equivalent |
|---------|-------------|------------|
| `ls` | List symbols in current module | `:list` |
| `ls -m`, `ls -modules` | List all available modules | `:modules` |
| `cd [module]` | Switch to a different module | `:go` |
| `pwd` | Show current module name | - |
| `mkdir [module]` | Create a new module | - |
| `find [term]` | Search for symbols and modules | `:find` |
| `man [command]` | Show help documentation | `:help` |
| `rm [symbol]` | Remove a symbol from current module | `:remove` |
| `rm [module]` | Remove an entire module | `:remove module:` |
| `rm [module]:[symbol]` | Remove a symbol from a specific module | `:remove` |
| `rm -f [target]` | Force remove without confirmation | `:remove -f` |
| `clear`, `cls` | Clear the terminal screen | - |

### Command Examples

#### Module Management

```
# Switch to a module (must exist)
hql[user]> :go math
Switched to module: math

# Attempting to switch to a non-existent module
hql[user]> :go nonexistent
Module 'nonexistent' does not exist.

Available modules:
------------
- user (current)
- math
------------

To create a new module, use the 'mkdir nonexistent' command.

# Or use the CLI-style command
hql[user]> cd math
Switched to module: math

# Create a new module
hql[math]> mkdir geometry
Created module: geometry
Use 'cd geometry' to switch to this module.

# Now you can switch to it
hql[math]> cd geometry
Switched to module: geometry
```

### Native HQL Import/Export

Instead of using special REPL commands for imports and exports, the HQL REPL now supports the language's native import and export syntax:

```
;; Import specific symbols from a module
(import [square, cube] from "math")

;; Import an entire module
(import math from "math")

;; Export specific symbols
(export [divide, multiply])

;; Export a default symbol
(export default add)
```

These statements work the same way they do in regular HQL files, maintaining consistency between the REPL and file-based development.

### Keyboard Shortcuts

The REPL supports various keyboard shortcuts to make editing more efficient:

| Shortcut | Description |
|----------|-------------|
| Up/Down arrows | Navigate history |
| Tab | Insert spaces |
| Home/End | Move to start/end of line |
| Ctrl+W | Delete a word at once |
| Ctrl+E | Move to end of line |
| Ctrl+A | Move to beginning of line |
| Ctrl+K | Kill line (delete from cursor to end of line) |
| Ctrl+U | Delete from cursor to beginning of line |
| Ctrl+L | Clear screen while keeping the current line |
| Ctrl+Left | Move backward one word |
| Ctrl+Right | Move forward one word |
| Ctrl+D | Delete character or exit REPL if line is empty |
| Ctrl+C | Exit the REPL |

## Implementation Details

### Storage Structure

The REPL state is stored in a JSON file with the following structure:

```json
{
  "version": "1.0.0",
  "lastModule": "user",
  "modules": {
    "user": {
      "definitions": {
        "variables": {},
        "functions": {},
        "macros": {}
      },
      "imports": [],
      "exports": []
    },
    "math": {
      "definitions": {
        "variables": {},
        "functions": {
          "square": { "_type": "function", "source": "function square(x) { return x * x; }", "originalSource": "(fn square (x) (* x x))" },
          "cube": { "_type": "function", "source": "function cube(x) { return x * x * x; }", "originalSource": "(fn cube (x) (* x x x))" }
        },
        "macros": {}
      },
      "imports": [],
      "exports": ["square"]
    }
  },
  "history": []
}
```

### Storage Location

The REPL state is stored in:

- Global state: `~/.hql-repl/state.json`
- Project-specific state: `<project-root>/.hql-repl/state.json`

Project-specific state takes precedence when you're in a project directory.

### Relationship with ESM JavaScript Modules

The HQL REPL's module system is designed to align with ECMAScript modules (ESM):

1. **Consistent import/export syntax** - Uses syntax similar to ES modules
2. **Explicit exports** - Only explicitly exported symbols are available to other modules
3. **Named imports** - Can import specific symbols from other modules
4. **Module namespaces** - Can import entire modules as namespaces

This alignment makes it easier to transition between HQL REPL sessions and file-based development.

### Best Practices

1. **Organize by purpose** - Create modules based on functionality (e.g., `math`, `http`, `ui`)
2. **Explicit exports** - Only export what you intend to be public interface
3. **Use descriptive names** - Module names should clearly indicate their purpose
4. **Keep modules focused** - Each module should have a single responsibility
5. **Document public interfaces** - Add comments to exported functions

## Planned Enhancements

### File-Based Module System (In Progress)

In the next version, the REPL will fully integrate with the file system to:

1. **Directly map modules to .hql files** - Each module will correspond to a .hql file on disk
2. **Automatic synchronization** - Changes in the REPL will update the corresponding file
3. **Seamless transitions** - Move easily between file editing and REPL interactions
4. **Consistent module semantics** - REPL modules will behave exactly like imported files

This will create complete consistency between REPL modules and HQL files:
```
hql[user]> :go math