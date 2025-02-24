;; simple.hql

;; Part 1: Local module import (assume simple2.hql exists if needed)
(def mod (import "./simple2.hql"))
(defn greet (name)
  (str (mod.sayHi name) " Welcome to HQL.")
)
(print (greet "Alice"))

;; Part 2: Remote-based definitions
(def strUtil (import "https://esm.sh/lodash"))
(defn greetRemote (name)
  (str (strUtil.upperCase "Hello, ") name "!")
)
(defn greetTwice (name)
  (str (greetRemote name) " " (greetRemote name))
)
(print (greetRemote "jss"))

;; Part 3: JS modules and interop:
(def chalk (import "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js"))
(print ((get chalk "blue") "hello hql!"))

(def chalk2 (import "jsr:@nothing628/chalk"))
(print ((get chalk2 "red") "hello hql?"))

(def lodash (import "npm:lodash"))
(print ((get lodash "chunk") (list 1 2 3 4 5 6) 2))

;; Part 4: Import a JS module that itself imports an HQL module.
(def simple (import "./interop.js"))
(print simple.sayHello)

(export "greet" greet)
(export "greetTwice" greetTwice)
