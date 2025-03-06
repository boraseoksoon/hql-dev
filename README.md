HQL (Higher Query Language)

HQL is a minimal, Lisp‑inspired language built around S‑expressions. Its core is intentionally lean—only a few basic constructs are built into the parser. All higher‑level language features (like functions with named/typed parameters and literal data structures) are added through an elegant macro system. This design follows the classic Lisp philosophy: a tiny core extended by powerful, user‑defined macros.

Table of Contents

Overview
Transpiler Pipeline
1. Parsing
2. Macro Expansion
3. Intermediate Representation (IR)
4. Code Generation
Extending HQL Syntax with Macros
Extended Function Definitions with fx
Literal Data Structures
Control Flow and Loop Macros
Threading Macros
User-Defined Macros
Standard Library Helpers
Conclusion
Overview

HQL is designed to be simple yet highly extensible. Its core language consists solely of S‑expressions (symbols, literals, and lists), and every richer construct is built via macros. This makes the language very flexible—users can define new syntax constructs as easily as they use them, without modifying the underlying parser.

Transpiler Pipeline

HQL’s compiler is structured as a series of well‑defined, modular stages. This separation of concerns makes it easy to add new language features without changing the core parser.

1. Parsing
What It Does:
The parser reads the HQL source code and tokenizes it into S‑expressions. At this stage, HQL only “knows” the basic constructs:
Symbols: e.g. x, +, fx
Literals: numbers, strings, booleans, nil
Lists: e.g. (+ 1 2 3)
Example Input:
(def x 10)
(fx add (x y) (+ x y))
Outcome:
The parser produces a raw AST composed entirely of S‑expressions. No “advanced” syntax (like object literals or extended function definitions) is built into this phase.
2. Macro Expansion
What It Does:
In this phase, the macro expander recursively transforms the raw AST into an enriched form. Built‑in macros (from files like macros.hql) and user‑defined macros transform S‑expressions into more expressive constructs.
How It Works:
For instance, the fx macro rewrites an extended function definition into a standard function form. Similarly, literal data structures written in a JSON‑like syntax are transformed into internal representations (e.g. (hash-map (keyword "name") "Alice" ...)).
Example Transformation (fx):
Input:
(fx add (x y) (+ x y))
Macro Expansion may yield:

(defn add (x y)
  (return (+ x y)))
Outcome:
The AST now includes constructs like standard function definitions, object literals, vectors, and sets—all built using macros.
3. Intermediate Representation (IR)
What It Does:
Once the AST is fully expanded, it is converted into an Intermediate Representation (IR). The IR abstracts away syntactic sugar and expresses the semantics of the program in a uniform way.
Why It Matters:
The IR phase separates semantic transformation from syntactic parsing. This modularity means that the code generation phase can operate on a consistent, simplified representation of the program.
Outcome:
A clean IR that represents functions, variable declarations, expressions, and control flow in a normalized form.
4. Code Generation
What It Does:
Finally, the IR is converted into target language code—typically JavaScript or TypeScript. The code generator produces human‑readable code that can be executed in modern environments.
How It Works:
The transpiler uses the IR to generate a TS/JS AST and then outputs source code. This stage is entirely decoupled from macro expansion, so any syntactic extensions via macros do not affect the code generation logic.
Outcome:
Executable JavaScript code that faithfully implements the behavior specified in the original HQL source.
Extending HQL Syntax with Macros

The macro system is the heart of HQL. It provides a uniform way to extend the language—whether you’re building a new function syntax or introducing literal data structures—without altering the parser.

Extended Function Definitions with fx
The fx macro provides an elegant way to define functions with extended features like named parameters, type annotations, and default values.

Basic Function Example

(fx add (x y)
  (+ x y))
How It Works:
The parser treats this as an S‑expression beginning with fx.
The macro expander rewrites it into a standard function definition:
(defn add (x y)
  (return (+ x y)))
The IR and code generator then output executable JavaScript code.
Function with Named and Typed Parameters

(fx greet-user (name: String title: String)
  (str "Hello, " title " " name "!"))
How It Works:
The parameter list (name: String title: String) indicates that parameters are named and optionally typed.
The macro expands this syntax into a standard function definition with either destructuring of a single parameter (like a params object) or other conventional means.
The resulting code might resemble:
function greetUser(params) {
  const { name, title } = params;
  return "Hello, " + title + " " + name + "!";
}
Function with Default Parameter Values

(fx add (x (y = 0))
  (+ x y))
How It Works:
The macro identifies that parameter y has a default value of 0.
It rewrites the function definition to handle the default, for example:
(defn add (x y)
  (if (nil? y) (set! y 0))
  (return (+ x y)))
This ensures that the function behaves correctly even if the second parameter isn’t provided.
Literal Data Structures
HQL supports literal data structures using familiar JSON‑like notation without complicating the parser.

Object Literals (JSON‑Style)

(def user {"name": "Alice", "age": 30})
How It Works:
The parser converts the curly braces into an S‑expression with a hash-map marker:
(hash-map (keyword "name") "Alice" (keyword "age") 30)
The macro system and subsequent IR transformation generate a JavaScript object literal:
const user = { name: "Alice", age: 30 };
Array (Vector) Literals

(def numbers [1, 2, 3, 4, 5])
How It Works:
Square brackets are parsed as a list beginning with the symbol vector:
(vector 1 2 3 4 5)
The code generator then produces a JavaScript array:
const numbers = [1, 2, 3, 4, 5];
Set Literals

(def unique-values #[1, 2, 3])
How It Works:
The set literal syntax (#[...]) is recognized and parsed into a list beginning with the symbol set.
The macro transforms this into a call to the Set constructor:
(new Set (vector 1 2 3))
Finally, the generated code looks like:
const uniqueValues = new Set([1, 2, 3]);
Control Flow and Loop Macros
HQL provides macros to create control structures without extending the core parser.

Conditionals

Standard if:
(if (> x 10)
    (print "Large")
    (print "Small"))
when for a single branch:
(when condition
  (do (print "Condition met")
      (do-other-stuff)))
unless:
(unless condition
  (print "Condition not met"))
Loop Constructs

HQL’s for macro supports both list comprehension and imperative-style loops.

List Comprehension Style:
(for [(i 0) (< i 10) (+ i 1)]
  (print i))
This form may be rewritten to something like:

(map (fn (i) (print i)) (range 10))
Imperative Style: The macro can also support a binding vector, test, and update expressions to build a recursive loop.
Threading Macros
Inspired by Clojure, HQL includes threading macros that make nested function calls more readable.

Left-Threading (->)

(-> user
    (get "name")
    (str "User: "))
How It Works:
Each expression “threads” the result of the previous expression as the first argument of the next.
Right-Threading (->>)

(->> data
     (filter valid?)
     (map process)
     (reduce combine 0))
How It Works:
Here, the result is threaded as the last argument of each subsequent function call.
User-Defined Macros
HQL provides a native defmacro so users can write their own extensions. All macros—whether built‑in or user‑written—are treated uniformly.

Example: Defining a JavaScript Array Literal Macro

(defmacro js-array (& elements)
  ;; Converts [1,2,3] into (vector 1 2 3)
  (concat (list 'vector) elements))
Usage:

(def my-array (js-array 1 2 3 4))
This macro operates on the same level as the standard macros and is expanded during the macro expansion phase.

Standard Library Helpers

HQL includes a rich set of helper functions that are available by default. These include:

Collection Functions:
first, rest, map, filter, reduce, concat, append, slice, nth, position, mapcat, range, any?, all?
Type Checking:
nil?, symbol?, list?, string?, number?, boolean?, function?
String Functions:
str, substring, ends-with?, starts-with?, to-string, split, join
Object Functions:
get-prop, set-prop!, has-prop?, keys
Math Functions:
abs, max, min, round
Utility Functions:
identity, constantly, comp, partial, not, always-true, always-false
These helpers are typically thin wrappers around JavaScript’s native functions (e.g., using js/Array.prototype.map.call), making it easy to interoperate with JavaScript.

Conclusion

HQL exemplifies the true Lisp philosophy: a minimal core of S‑expressions extended entirely by macros. Its design is centered around a clean, modular transpilation pipeline:

Parsing: Converting source code into basic S‑expressions.
Macro Expansion: Using built‑in and user‑defined macros (such as fx, literal data structures, conditionals, loops, and threading) to enrich the syntax.
Intermediate Representation: Normalizing the enriched AST into a semantic IR.
Code Generation: Producing executable JavaScript/TypeScript code from the IR.
This architecture not only keeps HQL’s core lean and maintainable but also offers a powerful, uniform way for both the language designers and users to extend its syntax. By leveraging macros for nearly every new language feature, HQL achieves elegant extensibility and scalability without resorting to hacky parser changes.