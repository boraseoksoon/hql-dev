// src/repl/repl-help.ts
// Help documentation and detailed command information

/**
 * Define CLI commands to REPL command mapping
 */
export const cliToReplCommandMap: Record<string, string> = {
  "ls": "list",
  "cd": "go",
  "pwd": "currentmodule",
  "find": "find",
  "man": "help",
  "rm": "remove",
  "mkdir": "mkdir",
  "clear": "clear"
};

/**
 * Get detailed help for a command
 */
export function getDetailedHelp(command: string, useColors: boolean = true): string {
  const commandName = command.toLowerCase().trim();
  
  // Check if this is a CLI command, map it to its REPL equivalent
  const mappedCommand = cliToReplCommandMap[commandName] || commandName;
  
  // Define help text for each command
  const helpText: Record<string, string> = {
    "help": "Display help information about commands.\nUsage: :help or :help <command>\nCLI equivalent: man <command>",
    
    "quit": "Exit the REPL.\nUsage: :quit or :exit\nAliases: :exit",
    "exit": "Exit the REPL.\nUsage: :exit or :quit\nAliases: :quit",
    
    "env": "Show environment bindings and defined symbols.\nUsage: :env",
    
    "macros": "Show defined macros.\nUsage: :macros",
    
    "modules": "List all available modules.\nUsage: :modules\nCLI equivalent: ls -m or ls -modules",
    
    "list": "Show symbols in current module.\nUsage: :list\nCLI equivalent: ls",
    
    "go": "Switch to a different module or show the current module.\nUsage: :go <module-name>\nCLI equivalent: cd <module-name>",
    
    "find": "Search for symbols and modules containing a search term.\nUsage: :find <search-term>\nCLI equivalent: find <search-term>",
    
    "currentmodule": "Show the name of the current module.\nUsage: :currentmodule\nCLI equivalent: pwd",
    
    "see": "Inspect modules and symbols.\nUsage: :see [module-name], :see [symbol-name], or :see [module]:[symbol]\nSpecial usage: :see all, :see all:modules, :see all:symbols",
    
    "doc": "Show documentation for a symbol or module.\nUsage: :doc <symbol> or :doc <module>/*\nCLI equivalent: man <symbol>",
    
    "remove": `Remove a symbol or module.
Usage: :remove <symbol> - Remove a symbol from current module
       :remove <module>:<symbol> - Remove a symbol from a specific module
       :remove <module> - Remove an entire module
       :remove -f <target> - Force remove without confirmation
       :remove -rf <target> - Force remove recursively without confirmation
       :remove * - Remove all symbols in current module
       :remove / - Remove everything (all modules and symbols)
CLI equivalent: rm <target>`,
    
    "verbose": "Toggle verbose mode to show more detailed output.\nUsage: :verbose\nYou can also evaluate an expression with verbose output: :verbose <expression>",
    
    "ast": "Toggle AST display mode for evaluated expressions.\nUsage: :ast",
    
    "expanded": "Toggle expanded form display for macros.\nUsage: :expanded",
    
    "js": "Toggle JavaScript code display for evaluated expressions.\nUsage: :js",
    
    "clear": "Clear the terminal screen.\nUsage: :clear\nCLI equivalent: clear or cls",
    
    "mkdir": "Create a new module.\nUsage: :mkdir <module-name>\nCLI equivalent: mkdir <module-name>",
    
    "cli": "Show available CLI-style commands.\nUsage: :cli",
    
    // CLI command help
    "ls": "List symbols in current module.\nUsage: ls\nOptions:\n  ls -m, ls -modules: List all modules\nREPL equivalent: :list",
    
    "cd": "Switch to a different module.\nUsage: cd <module-name>\nREPL equivalent: :go <module-name>",
    
    "pwd": "Show current module name.\nUsage: pwd\nREPL equivalent: :currentmodule",
    
    "man": "Show help documentation for commands.\nUsage: man <command>\nREPL equivalent: :help <command>",
    
    "rm": `Remove a symbol or module.
Usage: rm <symbol> - Remove a symbol from current module
       rm <module>:<symbol> - Remove a symbol from a specific module
       rm <module> - Remove an entire module
       rm -f <target> - Force remove without confirmation
       rm -rf <target> - Force remove recursively without confirmation
       rm * - Remove all symbols in current module
       rm / - Remove everything (all modules and symbols)
REPL equivalent: :remove <target>`,
    
    // Don't duplicate these keys - the keys below were already defined above
    // Update CLI commands to have unique property names
    "mkdir_cli": "Create a new module.\nUsage: mkdir <module-name>\nREPL equivalent: :mkdir <module-name>",
    
    "find_cli": "Search for symbols and modules containing a search term.\nUsage: find <search-term>\nREPL equivalent: :find <search-term>",
    
    "clear_cli": "Clear the terminal screen.\nUsage: clear or cls\nREPL equivalent: :clear"
  };
  
  const coloredTitle = useColors ? "\x1b[36;1m" : "";
  const reset = useColors ? "\x1b[0m" : "";
  
  // Return the help text for the command, or a message if not available
  if (helpText[mappedCommand]) {
    return `${coloredTitle}Command: ${mappedCommand}${reset}\n${helpText[mappedCommand]}`;
  } else {
    return `No detailed help available for '${commandName}'.`;
  }
}

/**
 * Documentation for built-in HQL functions
 */
export const builtinDocumentation: Record<string, string> = {
  // Basic arithmetic functions
  "+": "Adds numbers or concatenates strings/lists.\nUsage: (+ x y z ...)",
  "-": "Subtracts numbers.\nUsage: (- x y z ...) or (- x) for negation",
  "*": "Multiplies numbers.\nUsage: (* x y z ...)",
  "/": "Divides numbers.\nUsage: (/ x y z ...)",
  
  // Comparison functions
  "=": "Tests if values are equal.\nUsage: (= x y z ...)",
  "<": "Tests if values are in ascending order.\nUsage: (< x y z ...)",
  ">": "Tests if values are in descending order.\nUsage: (> x y z ...)",
  "<=": "Tests if values are in non-descending order.\nUsage: (<= x y z ...)",
  ">=": "Tests if values are in non-ascending order.\nUsage: (>= x y z ...)",
  
  // Logic functions
  "and": "Logical AND operation.\nUsage: (and expr1 expr2 ...)",
  "or": "Logical OR operation.\nUsage: (or expr1 expr2 ...)",
  "not": "Logical NOT operation.\nUsage: (not expr)",
  
  // Control flow
  "if": "Conditional expression.\nUsage: (if condition then-expr else-expr)",
  "when": "Executes body when condition is true.\nUsage: (when condition body ...)",
  "cond": "Multi-way conditional.\nUsage: (cond [test1 expr1] [test2 expr2] ...)",
  "do": "Evaluates expressions in sequence.\nUsage: (do expr1 expr2 ...)",
  
  // Definitions
  "def": "Defines a global variable.\nUsage: (def name value)",
  "fn": "Defines a function.\nUsage: (fn name [params] body)",
  "defn": "Shorthand to define a named function.\nUsage: (defn name [params] body)",
  "let": "Creates local bindings.\nUsage: (let [name1 val1, name2 val2] body ...)",
  
  // Sequence functions
  "map": "Applies function to items in collection.\nUsage: (map f coll)",
  "filter": "Filters collection by predicate.\nUsage: (filter pred coll)",
  "reduce": "Combines collection elements with a function.\nUsage: (reduce f init coll)",
  
  // Module system
  "import": "Imports symbols from modules.\nUsage: (import [symbol1, symbol2] from \"module\")",
  "export": "Exports symbols from current module.\nUsage: (export [symbol1, symbol2])",
  
  // Data structure operations
  "get": "Gets value at key/index.\nUsage: (get collection key-or-index)",
  "contains?": "Tests if collection contains value.\nUsage: (contains? collection value)",
  "nth": "Gets value at index.\nUsage: (nth collection index)",
  "first": "Gets first item in collection.\nUsage: (first collection)",
  "rest": "Gets all but first item.\nUsage: (rest collection)",
  "cons": "Prepends item to collection.\nUsage: (cons item collection)",
  
  // Type inspection
  "type": "Returns type of value.\nUsage: (type value)",
  "str": "Converts values to string.\nUsage: (str val1 val2 ...)",
  "name": "Gets name of symbol or keyword.\nUsage: (name symbol-or-keyword)"
};

/**
 * Documentation for special forms
 */
export const specialFormsDocs: Record<string, string[]> = {
  "if": [
    "Conditional expression.",
    "Syntax: (if condition then-expr else-expr)",
    "Evaluates condition. If true, evaluates and returns then-expr, otherwise else-expr."
  ],
  "when": [
    "Conditional execution when true.",
    "Syntax: (when condition body...)",
    "If condition is true, evaluates body expressions in order and returns the last one."
  ],
  "unless": [
    "Conditional execution when false.",
    "Syntax: (unless condition body...)",
    "If condition is false, evaluates body expressions in order and returns the last one."
  ],
  "cond": [
    "Multi-way conditional.",
    "Syntax: (cond [test1 expr1] [test2 expr2] ... [else default])",
    "Evaluates each test in order, returning the result for the first true test."
  ],
  "case": [
    "Pattern matching on a value.",
    "Syntax: (case value [pattern1 result1] [pattern2 result2] ... [_ default])",
    "Matches value against each pattern and returns the corresponding result."
  ],
  "let": [
    "Local variable bindings.",
    "Syntax: (let [var1 val1, var2 val2, ...] body...)",
    "Binds variables to values within the scope of body expressions."
  ],
  "fn": [
    "Named function definition.",
    "Syntax: (fn add (x y) -> (+ x y))",
    "Defines a named function with the given parameters and return type. The -> indicates the return type."
  ],
  "lambda": [
    "Anonymous function.",
    "Syntax: (lambda (params...) -> body...)",
    "Creates an anonymous function with the given parameters and body. The -> indicates the return type."
  ],
  "do": [
    "Sequential execution.",
    "Syntax: (do expr1 expr2 ... exprN)",
    "Evaluates expressions in sequence and returns the value of the last one."
  ],
  "quote": [
    "Prevents evaluation.",
    "Syntax: (quote expr) or 'expr",
    "Returns the expression without evaluating it."
  ],
  "->": [
    "Threading macro (pipe).",
    "Syntax: (-> initial-value (op1 args...) (op2 args...))",
    "Threads initial-value as the first argument through each operation."
  ],
  "->>": [
    "Threading macro (last position).",
    "Syntax: (->> initial-value (op1 args...) (op2 args...))",
    "Threads initial-value as the last argument through each operation."
  ],
  "module": [
    "Module definition.",
    "Syntax: (module name body...)",
    "Creates a new module or enters the context of an existing module."
  ],
  "import": [
    "Import symbols from modules.",
    "Syntax: (import [sym1, sym2] from \"module-name\")",
    "Makes specified symbols from the module available in the current scope."
  ],
  "export": [
    "Export symbols from a module.",
    "Syntax: (export symbol1 symbol2 ...)",
    "Makes specified symbols available for import by other modules."
  ]
}