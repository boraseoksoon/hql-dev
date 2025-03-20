MODULE IMPORT & EXPORT

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; CURRENT STATE

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Today, our macros are defined with defmacro and auto-register globally.

;; For example, in a.hql we have:

(defmacro print (& args)

  `(console.log ~@args))

(defmacro log (& args)

  `(console.log "LOG:" ~@args))

(defn add (x y)

  (+ x y))

;; Exports are done in a verbose, string-based manner:

(export "print" print)   ;; Global macro; cannot be exported.

(export "log" log)       ;; Global macro; cannot be exported.

(export "add" add)

;; As a result, macros like print and log are available everywhere,

;; which risks name collisions in larger codebases.

;;

;; For functions, we have to import modules as namespaces:

(import moduleA from "./a.hql")

(moduleA.add 3 4)  ;; => 7

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE VISION

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Our goal is to move toward a more modular system that:

;;

;; 1. Uses a concise, opinionated vector syntax for exports and imports.

;;    - No string-based exports—only vector-based.

;;    - Even single exports are written as vectors, e.g.:

;;          (export [add])

;;

;; 2. Allows direct import of selected symbols with built-in aliasing.

;;    - The syntax is:

;;

;;          (import [print, log] from "./a.hql")

;;          (import [print as print2, log] from "./a.hql")

;;


;;

;; 3. Maintains module boundaries to avoid global namespace pollution.

;;    - Instead of relying on global defmacro for user-defined macros,

;;      we plan to differentiate system-level macros (using defmacro) from

;;      user-level modular macros (using a new form, e.g. "macro").

;;

;;    - In our future design, user-level macros will not auto-register globally;

;;      they must be explicitly exported and imported.

;;

;; 4. Provides a clear, minimal, and opinionated syntax that avoids ambiguity.

;;

;; Below is an example of what our new system might look like.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE EXAMPLE: a.hql (Module Definition)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; SYSTEM-LEVEL MACROS remain defined with defmacro (global)

(defmacro print (& args)

  `(console.log ~@args))

(defmacro log (& args)

  `(console.log "LOG:" ~@args))

;; user-level macro. it must be imported/exported to be used like other normal module in contrast to defmacro (system global macro we have already)

(macro user-log (& args)

  `(console.log "LOG:" ~@args))

;; USER-LEVEL MACROS and functions use our new, opinionated export syntax.

;; (Note: In the future, we plan to introduce a new macro form (e.g. "macro")

;; for user-defined macros that are modular. For now, assume functions and

;; other exportable symbols follow the same vector export style.)

(defn add (x y)

  (+ x y))

;; Opinionated vector export (no strings, even if single export):

(export [add, user-log])

;; alternatively we can do

(export [add])

(export [user-log])

(export add) => X even if single module, always use JS vector to be opinionated and do not think but just follow.

;; We do NOT export 'print' or 'log' here because they are system-level (global).

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE USAGE IN CONSUMER: main.hql

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; With our new design, you can directly import selected symbols:

(import [print, log] from "./a.hql")

;; This brings the selected exports into the local scope.

(print "Hello from module a!")  ;; Uses the global 'print'

(log "Hello from module a!")    ;; Uses the global 'log'

;; Alternatively, you can use aliasing if you need to avoid collisions:

(import [print as print2, log, user-log as log2] from "./a.hql")

(print2 "Hello from module a, aliased!")  ;; 'print2' now refers to 'print'

(log2 "hello user macro log")	;; user macro exported and used

;; For functions exported via vector, you’d do similarly:

(import [add] from "./a.hql")

(add 3 4)  ;; => 7

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; SUMMARY & ROADMAP

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; CURRENT STATE:

;; - Macros are defined only with defmacro and auto-register globally.

;; - Exports use a verbose, string-based syntax, e.g.:

;;       (export "print" print)

;;       (export "log" log)

;;       (export "add" add)

;; - There is no mechanism to restrict macro registration to a module.

;; FUTURE VISION:

;; - Migrate to an opinionated vector export syntax for all exports.

;;      Examples:

;;         (export [add])

;;         (export [print, log])

;;      (No string-based export will be allowed.)

;;

;; - Allow direct import of selected symbols with built-in aliasing using the syntax:

;;         (import [print, log] from "./a.hql")

;;         (import [print as print2, log] from "./a.hql")


;;

;; - Introduce a new macro form (e.g., "macro") for user-level macros that are modular.

;;   These will NOT auto-register globally and must be explicitly exported.

;;

;; - Restructure modules so that imports are namespaced, reducing global collisions and

;;   making dependencies explicit.

;;

;; NEXT STEPS:

;; - Refactor our export system to use vector-only syntax.

;; - Implement the new "macro" form for user-level modular macros.

;; - Enhance the import/export mechanism to support aliasing and namespace-based usage.

;; This roadmap moves us from our current, global registration model (with defmacro only)

;; toward a modular, opinionated system that is concise, clear, and avoids name collisions.






;; from implementation (import from) 

Below is a summary of our discussion with code examples:

Overview
Goal:
Provide a syntactic sugar for module imports in Lisp-style syntax while ultimately converting it to a canonical, fully parenthesized S-expression.
Syntactic Sugar Form:
The user writes:
(import [add] from "./a.hql")
This is a convenient shorthand.
Canonical Form:
The macro or reader transforms the above into:
(import (add) :from "./a.hql")
Here, note that:

The vector [add] becomes the list (add) so that every part is a proper S-expression.
The bare symbol from is converted to the keyword :from.
Implementation Steps
Recognize the Syntactic Sugar:
Identify that (import [add] from "./a.hql") is a shorthand form.
Define a Macro or Reader Transformation:
Create a macro that:
Matches the pattern of an import expression with a vector of symbols and a module path.
Converts the vector (e.g., [add]) to a list (e.g., (add)).
Replaces the symbol from with the canonical keyword :from.
Maintain Canonical Internals:
Internally, use keywords like :from as per Lisp convention.
Optionally, you can allow additional syntactic sugar such as writing from:. However, this too should be converted to :from before further processing.
Example Code
Syntactic Sugar Form (User Input):

(import [add] from "./a.hql")
Canonical Form (After Transformation):

(import (add) :from "./a.hql")
Sample Macro Implementation (Pseudocode):

(defmacro import [imports-keyword & body]
  ;; Assume the syntax is:
  ;; (import [items] from "module")
  ;; We want to convert it to:
  ;; (import (items) :from "module")
  (let [items (first body)
        ;; Here we assume the next element is the symbol 'from' and the module path is the last element.
        module (last body)]
    `(import ~(if (vector? items)
                (apply list items)
                items)
             :from ~module)))
Note: This pseudocode shows the general idea. A production-quality version would include more robust pattern matching and error handling.

Conventions on Key Symbols
Canonical Lisp Convention:
Always use keywords with a leading colon (e.g., :from).
Optional Syntactic Sugar:
You can allow alternate forms (like from:) as user-friendly syntax, but these should be internally normalized to :from.
Recommendation:
Stick with the canonical :from internally to maintain consistency and leverage built-in language features.
This summary outlines how you convert syntactic sugar into a canonical S-expression using macros or reader transformations while preserving Lisp conventions.







;; how to implement new export and import syntax purely using macro 

;; i mean without changing internal how to achive them purely using defmacro? we can say that we have defmacro that is globally expanded 

Below is one example of how you can implement the new syntax using defmacro only—rewriting the vector‐based forms into the old, internal string‐based calls. (Note that these examples assume you have an internal function like import-module that does the actual module loading.)

Export Transformation
User code:

(export [add])
Macro expansion (rewritten to the old style):

(export "add" add)
A sample macro for export might look like:

(defmacro export [exports]
  (if (vector? exports)
    `(do
       ~@(map (fn [sym]
                `(export ~(str sym) ~sym))
              exports))
    (throw (ex-info "Expected vector export" {}))))
This macro checks that the argument is a vector and, for each symbol in it, produces an export call using the string form that your runtime already understands.

Import Transformation
User code:

(import [print as print2, log] from: "./a.hql")
This new syntax should be rewritten to something that loads the module and creates local bindings for each imported symbol. For example, the macro might expand into code that:

Loads the module (using an internal function such as import-module).
Binds each export by looking it up by name.
Handles aliasing (binding the original export to a different local name).
A sample macro for import might be:

(defmacro import [import-list from-key module-path]
  (if (and (vector? import-list)
           (= from-key 'from:))
    (let [mod-sym (gensym "mod")]
      `(let [~mod-sym (import-module ~module-path)]
         ~@(map (fn [item]
                  (if (seq? item)
                    ;; item of the form (print as print2)
                    (let [orig  (first item)
                          alias (nth item 2)]
                      `(def ~alias (get ~mod-sym ~(str orig))))
                    ;; simple item: just import by the same name
                    `(def ~item (get ~mod-sym ~(str item)))))
                import-list)))
    (throw (ex-info "Invalid import form" {}))))
In this macro:

We first check that the import-list is a vector and that the second argument is the keyword-like symbol from:.
We generate a unique symbol (here, mod-sym) to hold the loaded module.
For each item in the vector:
If the item is a sequence (like (print as print2)), we extract the original name and alias, and then bind the alias to the value obtained from the module.
Otherwise, we bind the symbol (e.g. log) directly.
The resulting code uses your existing internal mechanism (e.g. a function import-module) and string-based keys to fetch each export.

Summary
Using defmacro as a global rewrite layer, you can allow developers to write the new vector-based forms:

Export:
(export [add])
expands to

(export "add" add)
Import:
(import [print as print2, log] from: "./a.hql")
expands to a let-binding that loads the module and defines local bindings for print2 and log.
This approach leverages defmacro to provide the new, opinionated syntax without changing the internal runtime mechanisms.