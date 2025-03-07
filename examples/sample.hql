;; sample.hql - Demonstrates HQL features with "macro everywhere" approach

;; Import JavaScript libraries
(def lodash (import "npm:lodash"))
(def chalk (import "https://deno.land/std@0.170.0/fmt/colors.ts"))

;; Create a Date object using the 'new' macro (expands to js-new)
(def today (new Date))

;; JS interop to access properties and call methods
(def year (today.getFullYear))
(def month (today.getMonth))
(def date (today.getDate))

;; Define a custom when-not macro
(defmacro when-not [test & body]
  (list 'if (list 'not test)
        (cons 'do body)
        null))

;; Use the when-not macro
(when-not (= month 11)
  (def isDecember false)
  (print "It's not December"))

;; Define a function using the 'defn' macro (expands to def + fn)
(defn greet [name]
  (let [greeting (str "Hello, " name "!")]
    (print ((chalk.green) greeting))))

;; Define a function with the 'fx' macro (with type annotations)
(fx calculate-age [birthYear: Number] -> Number
  (- year birthYear))

;; Create a data processing pipeline using composed functions
(def numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
(def doubled (map (fn [n] (* n 2)) numbers))
(def evens (filter (fn [n] (= (% n 2) 0)) doubled))
(def sum (reduce (fn [acc n] (+ acc n)) 0 evens))

;; Demonstrate conditional expressions
(def message
  (if (> sum 50)
    "Sum is greater than 50"
    "Sum is not greater than 50"))

;; Call our functions
(greet "HQL")
(print (str "Current year: " year))
(print (str "Age of someone born in 1990: " (calculate-age 1990)))

;; Use JavaScript interop with the imported lodash library
(def chunks (lodash.chunk numbers 3))
(print "Chunked numbers:")
(print chunks)

;; Print the final results
(print (str "Original numbers: " numbers))
(print (str "Doubled: " doubled))
(print (str "Evens from doubled: " evens))
(print (str "Sum of evens: " sum))
(print message)

;; Export some values for external use
(export "today" today)
(export "greet" greet)
(export "calculateAge" calculate-age)
(export "sum" sum)