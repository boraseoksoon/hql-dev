;; examples/macros/a.hql
;; Example module defining user-level macros

;; Define a user-level macro that will be exported
(macro user-log (& args)
  `(console.log "USER LOG:" ~@args))

;; Define another user-level macro for formatting
(macro format-data (value label)
  `(let (result (+ ~label ": " ~value))
     result))

;; Define a normal function
(defn add (x y)
  (+ x y))

;; Define a global macro (this will be available everywhere)
(defmacro global-log (& args)
  `(console.log "GLOBAL LOG:" ~@args))

;; Export the user-level macros and normal function
(export [user-log, format-data, add])

;; This module can use its own macros
(user-log "This is from within the a.hql module")
(console.log (format-data "Example" "Test"))