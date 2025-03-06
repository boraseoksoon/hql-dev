;; Fixed helper functions for lib/helpers.hql

;; Get property from object (FIX: removed quotes from obj)
(defn get-prop (obj prop)
  (js/Reflect.get obj prop))

;; Set property on object (FIX: corrected implementation)
(defn set-prop! (obj prop val)
  (js/Reflect.set obj prop val))

;; Check if object has property (FIX: removed quotes from obj)
(defn has-prop? (obj prop)
  (js/Object.prototype.hasOwnProperty.call obj prop))

;; Get first element of a collection (FIX: removed quotes from coll)
(defn first (coll)
  (if (= (count coll) 0)
    nil
    (js/Array.prototype.at.call coll 0)))

;; Get the second element of a collection (FIX: removed quotes from coll)
(defn second (coll)
  (if (< (count coll) 2)
    nil
    (js/Array.prototype.at.call coll 1)))

;; Get the third element of a collection (FIX: removed quotes from coll)
(defn third (coll)
  (if (< (count coll) 3)
    nil
    (js/Array.prototype.at.call coll 2)))

;; Get all elements after the first (FIX: removed quotes from coll)
(defn rest (coll)
  (js/Array.prototype.slice.call coll 1))

;; Check if collection contains a value (FIX: removed quotes from coll)
(defn contains? (coll item)
  (>= (js/Array.prototype.indexOf.call coll item) 0))

;; Map a function over a collection (FIX: removed quotes from coll)
(defn map (f coll)
  (js/Array.prototype.map.call coll f))

;; Filter a collection by predicate (FIX: removed quotes from coll)
(defn filter (pred coll)
  (js/Array.prototype.filter.call coll pred))

;; Apply a function to each element of a collection (FIX: removed quotes from coll)
(defn for-each (f coll)
  (js/Array.prototype.forEach.call coll f))

;; Take a slice of a collection (FIX: removed quotes from coll)
(defn slice (coll start & end)
  (if (empty? end)
    (js/Array.prototype.slice.call coll start)
    (js/Array.prototype.slice.call coll start (first end))))

;; Get the nth element of a collection (FIX: removed quotes from coll)
(defn nth (coll idx)
  (if (>= idx (count coll))
    nil
    (js/Array.prototype.at.call coll idx)))

;; Find position of item in collection (FIX: removed quotes from coll)
(defn position (item coll)
  (js/Array.prototype.indexOf.call coll item))

;; FIX: Remove duplicate print definition
;; Use log as console.log
(def log js/console.log)
;; Define print as an alias to log
(def print log)

;; FIX: hasDefaultValue? implementation
(defn has-default-value? (param)
  (if (list? param)
    (if (> (count param) 2)
      (let [eq-symbol (symbol "=")
            eq-pos (position eq-symbol param)]
        (>= eq-pos 0))
      false)
    false))