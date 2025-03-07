;; combined_sample.hql
;; -------------------
;; A combined minimal HQL test file demonstrating variable definitions,
;; conditionals, function definitions, JS interop, anonymous functions,
;; and exports—all using only the core language and macros.

;; 1. Variable Definition and Conditional
(def greeting "Hello, HQL!")
(def check (if (= 5 5) "Yes, equals" "No, not equals"))

;; 2. Function Definition Using defn (defined in core.hql)
(defn square (x)
  (* x x))
(def result (square 8))

;; 3. JavaScript Interop: Import a Module and Use Its Method
(def path (import "https://deno.land/std@0.170.0/path/mod.ts"))
(def joined (path.join "folder" "file.txt"))

;; 4. Anonymous Function and Immediate Invocation
(def doubled ((fn (x) (* 2 x)) 21))

;; 5. Export Values for Inspection
(export "greeting" greeting)
(export "check" check)
(export "result" result)
(export "joined" joined)
(export "doubled" doubled)
