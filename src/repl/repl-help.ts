// src/repl/repl-help.ts
// Help documentation and detailed command information

/**
 * Get detailed help text for a specific command
 */
export function getDetailedHelp(command: string, useColors: boolean): string {
    const helpText: Record<string, string> = {
      "help": "Display help information about available commands.",
      "quit": "Exit the REPL session.",
      "exit": "Exit the REPL session.",
      "env": "Display all environment bindings (defined variables and functions).",
      "macros": "Show all defined macros.",
      "module": "Switch to a different module or show the current module.\nCLI shortcut: cd <module-name> - Switch to another module\npwd - Show current module",
      "modules": "List all available modules.\nCLI shortcut: ls - List all available modules",
      "list": "Show all symbols defined in the current module.",
      "remove": "Remove a symbol or module.",
      "see": "Inspect modules and symbols in detail.",
      "verbose": "Toggle verbose output mode or evaluate an expression with verbose output.",
      "ast": "Toggle AST display mode or show the AST for a specific expression.",
      "js": "Show the JavaScript transpilation for a given expression.",
      "doc": "Show documentation for a symbol or module."
    };
    
    return helpText[command] || `No detailed help available for '${command}'.`;
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