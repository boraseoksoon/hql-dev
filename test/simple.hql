;; simple.hql
;; Import local module and use it:
(def mod (import "./simple2.hql"))
(defn greet (name)
  (str (mod.sayHi name) " Welcome to HQL.")
)
(print (greet "Alice"))

;; Now, also import a remote library and define a separate greeting function.
(def strUtil (import "https://esm.sh/lodash"))
(defn greetRemote (name)
  (str (strUtil.upperCase "Hello, ") name "!")
)

(defn greetTwice (name)
  (str (greetRemote name) " " (greetRemote name))
)
(defn add (x y)
  (+ x y)
)
(defn complexGreeting (name x y)
  (str (greetTwice name) " The sum is: " (add x y))
)
(print (greetRemote "jss"))

;; Import and log using chalk.
(def chalk (import "https://deno.land/x/chalk_deno@v4.1.1-deno/source/index.js"))
(print ((get chalk "blue") "hello hql!"))

;; Import chalk2 using a jsr URL.
(def chalk2 (import "jsr:@nothing628/chalk"))
(print ((get chalk2 "red") "hello hql?"))

;; Import lodash using npm.
(def lodash (import "npm:lodash"))
(print ((get lodash "chunk") (list 1 2 3 4 5 6) 2))

(export "greet" greet)
(export "greetTwice" greetTwice)
(export "add" add)
(export "complexGreeting" complexGreeting)
