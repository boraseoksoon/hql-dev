(defmacro defn (name params & body)
  `(let ~name (lambda ~params ~@body)))
  
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
      `(let (temp (lambda () ~@body))
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

(defmacro if-let (binding then-expr else-expr)
  (let (var-name (first binding)
        var-value (second binding))
    `((lambda (~var-name)
         (if ~var-name
             ~then-expr
             ~else-expr))
       ~var-value)))

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

(defmacro second (coll)
  `(if (and (not (nil? ~coll)) (> (length ~coll) 1))
      (nth ~coll 1)
      nil))

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

;; macro import test from default module import
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
(import module from "../examples/dependency-test2/a.hql")
(defmacro text-wrapper (a b) `(module.add3 ~a ~b))

;; (import module from "./test/text-utils.hql")
;; (defmacro text-wrapper (text) `(module.wrap_text ~text))

(import formatter from "./test/formatter.js")
(defmacro js-format-text (text) `(formatter.formatText ~text))

;; (import [formatText] from "./test/formatter.js")
;; (defmacro js-format-text (text) `(formatText ~text))