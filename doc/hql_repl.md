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
   - Module switching via `:module <name>`
   - Module listing with `:modules`
   - Module removal with `:remove <name>`
   - Automatic module creation on first use
   - Module-specific state management

4. **Persistence Layer**
   - Automatic state saving after evaluations
   - State restoration on startup
   - Project-specific state management
   - Version compatibility tracking

5. **Enhanced Commands**
   - `:list` - Show current module contents
   - `:remove <name>` - Remove symbol or module
   - `:reset` - Reset entire environment

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

hql[user]> (defn square [x] (* x x))
[Function: square]

hql[user]> (square 5)
25
```

All definitions are automatically saved and will be available in future REPL sessions.

### Working with Modules

Modules help organize your code. You can create and switch between modules:

```
hql[user]> :module math
Switched to module: math

hql[math]> (defn square [x] (* x x))
[Function: square]

hql[math]> (defn cube [x] (* x x x))
[Function: cube]

hql[math]> (cube 3)
27
```

You can switch back to another module:

```
hql[math]> :module user
Switched to module: user

hql[user]> 
```

List all available modules:

```
hql[user]> :modules
Available Modules:
Module names:
------------
* user
  math
------------
* Current module
```

List all definitions in the current module:

```
hql[math]> :list
Symbols in module 'math':
Symbol names:
------------
- cube
- square
------------
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `:help` | Show help information | `:help` |
| `:quit`, `:exit` | Exit the REPL | `:quit` |
| `:env` | Show environment bindings | `:env` |
| `:macros` | Show defined macros | `:macros` |
| `:module [<name>]` | Switch to or create module. If no name is provided, shows current module | `:module math` |
| `:modules` | List available modules | `:modules` |
| `:list` | Show current module contents | `:list` |
| `:remove <name>` | Remove symbol or module | `:remove square` |
| `:js` | Toggle JavaScript output display | `:js` |
| `:reset` | Reset REPL environment | `:reset` |
| `:verbose` | Toggle verbose logging | `:verbose` |
| `:ast` | Toggle AST display | `:ast` |
| `:expanded` | Toggle expanded form display | `:expanded` |

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
          "square": { "_type": "function", "source": "function square(x) { return x * x; }" },
          "cube": { "_type": "function", "source": "function cube(x) { return x * x * x; }" }
        },
        "macros": {}
      },
      "imports": [],
      "exports": []
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

### Best Practices

1. **Module Organization**
   - Use meaningful module names
   - Keep related functionality together
   - Use separate modules for different domains

2. **State Management**
   - Regularly clean up unused definitions with `:remove`
   - Use `:reset` to clear all definitions when needed
   - Use `:list` to see what's defined in the current module

3. **Error Handling**
   - Check for name conflicts when defining new functions
   - Use meaningful function and variable names

## Future Enhancements

1. **Cross-module References**
   - Symbol imports from other modules
   - Module dependencies tracking
   - Protection against circular dependencies

2. **Enhanced Performance**
   - Lazy loading of module contents
   - Memory optimizations for large sessions
   - State compaction for large state files

3. **Developer Experience**
   - Enhanced debugging tools
   - Better visualization of state
   - Integration with IDEs and editors 

## Command Examples with Expected Output

### Basic Evaluation
```
hql[user]> (+ 1 2 3)
6

hql[user]> (- 10 5)
5

hql[user]> (* 2 3 4)
24
```

### Function Definition and Usage
```
hql[user]> (defn add-three [x] (+ x 3))
[Function: add-three]

hql[user]> (add-three 7)
10

hql[user]> (defn square [x] (* x x))
[Function: square]

hql[user]> (square 4)
16
```

### Module Commands
```
hql[user]> :module
Current module: user

hql[user]> :module math
Switched to module: math

hql[math]> (defn square [x] (* x x))
[Function: square]

hql[math]> :modules
Available Modules:
Module names:
------------
  user
* math
------------
* Current module

hql[math]> :module user
Switched to module: user
```

### List Command
```
hql[math]> :list
Symbols in module 'math':
Symbol names:
------------
- square
------------

hql[user]> :list
Symbols in module 'user':
Symbol names:
------------
- add-three
------------
```

### Remove Command
```
hql[user]> (defn temporary [x] (+ x 1))
[Function: temporary]

hql[user]> :list
Symbols in module 'user':
Symbol names:
------------
- add-three
- temporary
------------

hql[user]> :remove temporary
Symbol 'temporary' removed from module 'user'

hql[user]> :list
Symbols in module 'user':
Symbol names:
------------
- add-three
------------
```

### Reset Command
```
hql[user]> :list
Symbols in module 'user':
Symbol names:
------------
- add-three
------------

hql[user]> :reset
REPL environment has been reset

hql[user]> :list
Symbols in module 'user':
Symbol names:
------------
No symbols defined
------------

hql[user]> :modules
Available Modules:
Module names:
------------
* user
------------
* Current module
```

### JS Toggle
```
hql[user]> (defn add [a b] (+ a b))
[Function: add]

hql[user]> :js
JavaScript output enabled

hql[user]> (add 2 3)
// JavaScript:
function add(a, b) { return a + b; }
add(2, 3)
// Result:
5

hql[user]> :js
JavaScript output disabled

hql[user]> (add 2 3)
5
```

### AST Toggle
```
hql[user]> :ast
AST display enabled

hql[user]> (+ 1 2)
// AST:
{
  "type": "CallExpression",
  "name": "+",
  "args": [
    { "type": "NumericLiteral", "value": 1 },
    { "type": "NumericLiteral", "value": 2 }
  ]
}
// Result:
3

hql[user]> :ast
AST display disabled

hql[user]> (+ 1 2)
3
```

### Expanded Toggle
```
hql[user]> (defmacro when [condition & body]
  `(if ~condition (do ~@body) nil))
[Macro: when]

hql[user]> :expanded
Expanded form display enabled

hql[user]> (when true (println "Hello") (+ 1 2))
// Expanded:
(if true (do (println "Hello") (+ 1 2)) nil)
// Result:
Hello
3

hql[user]> :expanded
Expanded form display disabled
```

### Environment Display
```
hql[user]> (def x 10)
10

hql[user]> (def y 20)
20

hql[user]> :env
Environment bindings:
user/x: 10
user/y: 20
```

### Macros Display
```
hql[user]> (defmacro unless [condition & body]
  `(if (not ~condition) (do ~@body) nil))
[Macro: unless]

hql[user]> :macros
Defined macros:
user/unless: (defmacro unless [condition & body] ...)
``` 