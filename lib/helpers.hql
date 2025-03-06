;; HQL Standard Library - Helper Functions
;; This file provides utility functions for HQL code and macros

;; =========================================================
;; Collection Functions
;; =========================================================

;; Get the first element of a collection
(defn first (coll)
  (if (= (js/Array.prototype.length.call coll) 0)
    nil
    (js/Array.prototype.at.call coll 0)))

;; Get the second element of a collection
(defn second (coll)
  (if (< (js/Array.prototype.length.call coll) 2)
    nil
    (js/Array.prototype.at.call coll 1)))

;; Get the third element of a collection
(defn third (coll)
  (if (< (js/Array.prototype.length.call coll) 3)
    nil
    (js/Array.prototype.at.call coll 2)))

;; Get all elements after the first
(defn rest (coll)
  (js/Array.prototype.slice.call coll 1))

;; Get the count/length of a collection
(defn count (coll)
  (if (or (= coll nil) (= coll undefined))
    0
    (js/Array.prototype.length.call coll)))

;; Check if a collection is empty
(defn empty? (coll)
  (= (count coll) 0))

;; Check if collection contains a value
(defn contains? (coll item)
  (>= (js/Array.prototype.indexOf.call coll item) 0))

;; Map a function over a collection
(defn map (f coll)
  (js/Array.prototype.map.call coll f))

;; Filter a collection by predicate
(defn filter (pred coll)
  (js/Array.prototype.filter.call coll pred))

;; Apply a function to each element of a collection
(defn for-each (f coll)
  (js/Array.prototype.forEach.call coll f))

;; Reduce a collection with a function
(defn reduce (coll f init)
  (js/Array.prototype.reduce.call coll f init))

;; Combine multiple collections
(defn concat (& colls)
  (js/Array.prototype.concat.apply [] colls))

;; Append items to a collection
(defn append (coll & items)
  (concat coll items))

;; Take a slice of a collection
(defn slice (coll start & end)
  (if (empty? end)
    (js/Array.prototype.slice.call coll start)
    (js/Array.prototype.slice.call coll start (first end))))

;; Get the nth element of a collection
(defn nth (coll idx)
  (if (>= idx (count coll))
    nil
    (js/Array.prototype.at.call coll idx)))

;; Find position of item in collection
(defn position (item coll)
  (js/Array.prototype.indexOf.call coll item))

;; Combine map and concat
(defn mapcat (f coll)
  (reduce (map f coll)
          (fn (acc items) (concat acc items))
          []))

;; Generate a range of numbers
(defn range (n)
  (let [result []]
    (for ((i 0) (< i n) (+ i 1))
      (set! result (concat result [i])))
    result))

;; Check if any item satisfies predicate
(defn any? (pred coll)
  (js/Array.prototype.some.call coll pred))

;; Check if all items satisfy predicate
(defn all? (pred coll)
  (js/Array.prototype.every.call coll pred))

;; =========================================================
;; Type Checking Functions
;; =========================================================

;; Check if value is null or undefined
(defn nil? (x)
  (or (= x nil) (= x undefined)))

;; Check if value is a symbol
(defn symbol? (x)
  (and (not (nil? x))
       (js/Object.prototype.hasOwnProperty.call x "type")
       (= (js/Object.prototype.get.call x "type") "symbol")))

;; Check if value is a list
(defn list? (x)
  (and (not (nil? x))
       (js/Object.prototype.hasOwnProperty.call x "type")
       (= (js/Object.prototype.get.call x "type") "list")))

;; Check if value is a string
(defn string? (x)
  (= (js/typeof x) "string"))

;; Check if value is a number
(defn number? (x)
  (= (js/typeof x) "number"))

;; Check if value is a boolean
(defn boolean? (x)
  (= (js/typeof x) "boolean"))

;; Check if value is a function
(defn function? (x)
  (= (js/typeof x) "function"))

;; =========================================================
;; String Functions
;; =========================================================

;; Concatenate strings
(defn str (& args)
  (reduce args
          (fn (acc x) (+ acc (js/String x)))
          ""))

;; Get substring
(defn substring (s start end)
  (js/String.prototype.substring.call s start end))

;; Check if string ends with suffix
(defn ends-with? (s suffix)
  (js/String.prototype.endsWith.call s suffix))

;; Check if string starts with prefix
(defn starts-with? (s prefix)
  (js/String.prototype.startsWith.call s prefix))

;; Convert to string
(defn to-string (x)
  (js/String x))

;; Split string
(defn split (s separator)
  (js/String.prototype.split.call s separator))

;; Join array to string
(defn join (arr separator)
  (js/Array.prototype.join.call arr separator))

;; =========================================================
;; Object Functions
;; =========================================================

;; Get property from object
(defn get-prop (obj prop)
  (js/Object.prototype.get.call obj prop))

;; Set property on object
(defn set-prop! (obj prop val)
  (set! (js/Object.prototype.get.call obj prop) val))

;; Check if object has property
(defn has-prop? (obj prop)
  (js/Object.prototype.hasOwnProperty.call obj prop))

;; Get object keys
(defn keys (obj)
  (js/Object.keys.call js/Object obj))

;; =========================================================
;; Math Functions
;; =========================================================

;; Absolute value
(defn abs (x)
  (js/Math.abs x))

;; Maximum of values
(defn max (& args)
  (js/Math.max.apply js/Math args))

;; Minimum of values
(defn min (& args)
  (js/Math.min.apply js/Math args))

;; Round number
(defn round (x)
  (js/Math.round x))

;; =========================================================
;; Utility Functions
;; =========================================================

;; Identity function
(defn identity (x)
  x)

;; Constantly return value
(defn constantly (x)
  (fn () x))

;; Composition of functions
(defn comp (f g)
  (fn (& args)
    (f (apply g args))))

;; Partial application
(defn partial (f & args1)
  (fn (& args2)
    (apply f (concat args1 args2))))

;; Logical not
(defn not (x)
  (if x false true))

;; Always return true
(defn always-true (& _)
  true)

;; Always return false
(defn always-false (& _)
  false)

;; =========================================================
;; Macro-Specific Helpers
;; =========================================================

;; Create a symbol node
(defn symbol (name)
  (hash-map (keyword "type") "symbol" (keyword "name") name))

;; Create a keyword node
(defn keyword (name)
  (hash-map (keyword "type") "keyword" (keyword "value") name))

;; Create a literal node
(defn literal (value)
  (hash-map (keyword "type") "literal" (keyword "value") value))

;; Create a list node
(defn make-list (& elements)
  (hash-map (keyword "type") "list" (keyword "elements") elements))