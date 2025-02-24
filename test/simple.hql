;; simple.hql

(def strUtil (import "https://esm.sh/lodash"))
(defn greet (name)
  (str (strUtil.upperCase "Hello, ") name "!")
)
(defn greetTwice (name)
  (str (greet name) " " (greet name))
)
(defn add (x y)
  (+ x y)
)
(defn complexGreeting (name x y)
  (str (greetTwice name) " The sum is: " (add x y))
)

(print (greet "jss"))

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

