(defmacro defn (name params & body)
  `(def ~name (fn ~params ~@body)))
  
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

(defmacro when (test & body)
  (if (= (length body) 0)
      `(if ~test nil nil)
      (if (= (length body) 1)
          `(if ~test ~(first body) nil)
          `(if ~test (do ~@body) nil))))

(defmacro let (bindings & body)
  (if (= (length bindings) 0)
      `(do ~@body)
      `((fn (~(first bindings))
           ~(if (> (length bindings) 2)
                `(let ~(rest (rest bindings)) ~@body)
                (if (= (length body) 1)
                    (first body)
                    `(do ~@body))))
        ~(second bindings))))

(defmacro if-let (binding then-expr else-expr)
  `(let (~(first binding) ~(second binding))
     (if ~(first binding)
         ~then-expr
         ~else-expr)))

;; no distinction between list and vector now.
(defmacro list (& items)
  `[~@items])

(defmacro nil? (x)
  `(= ~x null))

(defmacro length (coll)
  `(if (= ~coll null)
       0
       (js-get ~coll "length")))

;; Simple implementations of list operations
(defmacro first (coll)
  `(get ~coll 0))

(defmacro rest (coll)
  `(js-call ~coll "slice" 1))

(defmacro next (coll)
  `(if (< (js-get ~coll "length") 2)
       null
       (js-call ~coll "slice" 1)))

(defmacro seq (coll)
  `(if (= (js-get ~coll "length") 0)
       null
       ~coll))

(import chalk from "jsr:@nothing628/chalk@1.0.0")

(defmacro colorize (color text)
  `(js-call chalk ~color ~text))

(defmacro green-text (text)
  `(colorize "green" ~text))

;; Test NPM imports
(import _ from "npm:lodash")

;; Define a macro that uses lodash's capitalize function
(defmacro capitalize-text (text)
  `(js-call _ "capitalize" ~text))

;; Test HTTP imports using esm.sh CDN
(import _ from "https://esm.sh/lodash")

;; Define a macro that uses lodash's uppercase function
(defmacro uppercase-text (text)
  `(js-call _ "toUpper" ~text))

;; Test HQL imports
(import module from "./test/text-utils.hql")

;; Create a local macro that uses the imported function
(defmacro text-wrapper [text]
  `(module.wrap_text ~text))

/*
;; 4. JS Import - named export
(import [formatText] from "./lib/test/formatter.js")

;; Define a JS named import macro
(defmacro format-direct (text)
  `(formatText ~text))

;; 5. JS Import - default export
(import formatter from "./lib/test/formatter.js") 

;; Define a JS default import macro
(defmacro format-default (text)
  `(js-call formatter "formatText" ~text))
*/