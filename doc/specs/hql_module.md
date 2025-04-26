MODULE IMPORT & EXPORT

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; CURRENT STATE

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Today, our macros are defined with macro and auto-register globally.

;; For example, in a.hql we have:

(macro print (& args)

`(console.log ~@args))

(macro log (& args)

`(console.log "LOG:" ~@args))

(fn add (x y)

(+ x y))

;; Exports are now only done with concise, vector-based syntax:

(export [print]) ;; Global macro; cannot be exported.
(export [log])   ;; Global macro; cannot be exported.
(export [add])   ;; Function export (vector-based, required)

;; As a result, macros like print and log are available everywhere,
;; which risks name collisions in larger codebases.
;;
;; For functions, we have to import modules as namespaces:
(import moduleA from "./a.hql") ;; New syntax with 'from' is now required
(moduleA.add 3 4) ;; => 7

;; NOTE: String-based exports (e.g. (export "add" add)) are no longer supported. Always use vector syntax: (export [add])


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE VISION

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Our goal is to move toward a more modular system that:

;;

;; 1. Uses a concise, opinionated vector syntax for exports and imports.

;; - No string-based exports—only vector-based.

;; - Even single exports are written as vectors, e.g.:

;; (export [add])

;;

;; 2. ALWAYS requires 'from' in all imports to be consistent and reduce
cognitive load:

;; - For namespace imports:

;; (import module from "./some-module.hql")

;; - For named imports:

;; (import [print, log] from "./a.hql")

;; (import [print as print2, log] from "./a.hql")

;; - NO imports without 'from' will be allowed.

;;

;; 3. Maintains module boundaries to avoid global namespace pollution.

;; - All macros are defined with macro and are available globally.

;;

;; - This design centralizes macro definitions while maintaining a clear

;; separation between macros and regular functions.

;;

;; 4. Provides a clear, minimal, and opinionated syntax that avoids ambiguity.

;;

;; Below is an example of what our new system might look like.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE EXAMPLE: a.hql (Module Definition)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; All macros are defined with macro (global)

(macro print (& args)

`(console.log ~@args))

(macro log (& args)

`(console.log "LOG:" ~@args))

(macro user-log (& args)

`(console.log "LOG:" ~@args))

;; Functions use our new, opinionated export syntax.

;; Assume functions and other exportable symbols (excluding macros) follow

;; the vector export style.

;; other exportable symbols follow the same vector export style.)

(fn add (x y)

(+ x y))

;; Opinionated vector export (no strings, even if single export):

(export [add])

;; Multiple exports in a single vector:
(export [add, subtract])

;; Aliasing exports is only supported via vector syntax:
(export [add as sum, subtract as diff])

;; INCORRECT - do not use string-based or non-vector exports:
;; (export "add" add) => X
;; (export add) => X

;; We do NOT export 'print', 'log', or 'user-log' here because they are macros
;; (defined with macro) which are automatically global.

;; NOTE: Always use the vector form for all exports, including aliases. String-based and non-vector exports are not supported.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE USAGE IN CONSUMER: main.hql

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; With our new design, you directly import selected symbols:

(import [print, log] from "./a.hql")

;; This brings the selected exports into the local scope.

(print "Hello from module a!") ;; Uses the imported 'print'

(log "Hello from module a!") ;; Uses the imported 'log'

;; Alternatively, you can use aliasing if you need to avoid collisions:

(import [print as print2, log] from "./a.hql")

(print2 "Hello from module a, aliased!") ;; 'print2' now refers to 'print'

;; For namespace imports (entire module):

(import moduleA from "./a.hql")

(moduleA.add 3 4) ;; => 7

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; SUMMARY & ROADMAP

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; CURRENT STATE:

;; - Macros are defined only with macro and auto-register globally.

;; - Exports use a verbose, string-based syntax, e.g.:

;; (export [print])

;; (export [log])

;; (export [add])

;; - Imports now enforce the use of 'from':

;; (import moduleA from "./a.hql")

;; - There is no mechanism to restrict macro registration to a module.

;; FUTURE VISION:

;; - Migrate to an opinionated vector export syntax for all exports.

;; Examples:

;; (export [add])

;; (export [print, log])

;; (No string-based export will be allowed.)

;;

;; - Enforce 'from' in all imports for consistency and clarity:

;; (import [print, log] from "./a.hql") // For named imports

;; (import moduleA from "./a.hql") // For namespace imports

;; (No imports without 'from' will be allowed.)

;;

;; - Use macro for all macro definitions, which are globally available.

;;

;; - Restructure modules so that imports are namespaced, reducing global
collisions and

;; making dependencies explicit.
