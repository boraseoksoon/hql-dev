;; Variable definitions (expressions)
(def greeting "Hello, HQL!")
(def answer 42)

;; JavaScript interop: creating a new Date and calling a JS function.
(def today (new Date))
(def randomValue (js/Math.random))

;; Import external modules (these produce static ES module imports).
(def lodash (import "npm:lodash"))
(def path   (import "https://deno.land/std@0.170.0/path/mod.ts"))

;; --- String interop examples ---

;; A plain string literal.
(def message "hello")

;; Access a property on the string: this should return the length.
(def len (message.length))

;; Call a no-parameter method on the string: this returns the upper-case version.
(def upper (message.toUpperCase))

;; --- Date interop example ---

;; Call a no-parameter method on the Date object to get the timestamp.
(def timestamp (today.getTime))

;; --- Imported modules interop examples ---

;; Call a method on the imported path module: join path segments.
(def joined (path.join "folder" "file.txt"))

;; Call a method on the imported lodash module:
;; Using lodash.identity to return its argument.
(def id (lodash.identity "example"))

;; Function definition (returns the literal "OK" implicitly).
(defn ok ()
  "OK")

;; Export some values for inspection.
(export "greeting" greeting)
(export "upper" upper)
(export "timestamp" timestamp)
(export "joined" joined)
(export "id" id)
