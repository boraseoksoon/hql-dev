(defmacro or (a b)
  `(if ~a ~a ~b))

(defmacro and (x y)
  `(if ~x ~y ~x))

(defmacro not (x)
  `(if ~x false true))

(defmacro unless (test expr)
  `(if ~test nil ~expr))

(defmacro inc (x)
  `(+ ~x 1))

(defmacro dec (x)
  `(- ~x 1))

(defmacro print (& args)
  `(console.log ~@args))

(def base 10)

(defmacro cons (item lst)
  `(concat (list ~item) ~lst))

(defn concat (arr1 arr2)
  (js-call arr1 "concat" arr2))

(defn empty? (coll)
  (cond
    ((nil? coll) true)
    ((list? coll) (= (length coll) 0))
    ((js-call coll "size") (= (js-call coll "size") 0))
    ((map? coll) (= (length (js-call Object "keys" coll)) 0))
    (true false)))

(defmacro str (& args)
  (if (empty? args)
      (if (= (length args) 1)
          `(+ "" ~(first args))
          `(+ ~@args))))

(defmacro do (& body)
  (if (= (length body) 0)
      nil
      `(let (temp (fn () ~@body))
         (temp))))

(defmacro contains? (coll key)
  `(js-call ~coll "has" ~key))

(defmacro nth (coll index)
  `(get ~coll ~index))

(defmacro cond (& clauses)
  (if (= (length clauses) 0)
      nil
      (if (= (length clauses) 1)
          `(if ~(first (first clauses))
               ~(second (first clauses))
               nil)
          `(if ~(first (first clauses))
               ~(second (first clauses))
               (cond ~@(rest clauses))))))