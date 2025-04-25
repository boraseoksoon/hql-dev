(macro or (a b)
  `(if ~a ~a ~b))

(macro and (x y)
  `(if ~x ~y ~x))

(macro not (x)
  `(if ~x false true))

(macro unless (test & body)
  `(if ~test
       nil
       (do ~@body)))

(macro inc (x)
  `(+ ~x 1))

(macro dec (x)
  `(- ~x 1))

(macro when (test & body)
  `(if ~test
       (do ~@body)
       nil))

(macro when-let (binding & body)
  (let (var-name (first binding)
        var-value (second binding))
    `((lambda (~var-name)
         (when ~var-name
             ~@body))
       ~var-value)))

(macro print (& args)
  `(console.log ~@args))

(macro cons (item lst)
  `(concat (list ~item) ~lst))

(fn concat (arr1 arr2)
  (js-call arr1 "concat" arr2))

(macro str (& args)
  (cond
    ((empty? args) `"")
    ((= (length args) 1) `(+ "" ~(first args)))
    (true `(+ ~@args))))

(macro empty? (coll)
  `(or (nil? ~coll)
       (= (length ~coll) 0)))

(macro contains? (coll key)
  `(js-call ~coll "has" ~key))

(macro nth (coll index)
  `(get ~coll ~index))

(macro if-let (binding then-expr else-expr)
  (let (var-name (first binding)
        var-value (second binding))
    `((lambda (~var-name)
         (if ~var-name
             ~then-expr
             ~else-expr))
       ~var-value)))

;; no distinction between list and vector now.
(macro list (& items)
  `[~@items])

(macro nil? (x)
  `(= ~x null))

(macro length (coll)
  `(if (= ~coll null)
       0
       (js-get ~coll "length")))

;; Simple implementations of list operations
(macro first (coll)
  `(get ~coll 0))

(macro second (coll)
  `(if (and (not (nil? ~coll)) (> (length ~coll) 1))
      (nth ~coll 1)
      nil))

(macro rest (coll)
  `(js-call ~coll "slice" 1))

(macro next (coll)
  `(if (< (js-get ~coll "length") 2)
       null
       (js-call ~coll "slice" 1)))

(macro seq (coll)
  `(if (= (js-get ~coll "length") 0)
       null
       ~coll))