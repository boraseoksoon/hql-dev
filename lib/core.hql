(defmacro or (a b)
  `(if ~a ~a ~b))

(defmacro and (x y)
  `(if ~x ~y ~x))

(defmacro not (x)
  `(if ~x false true))

(defmacro unless (test & body)
  `(if ~test
       nil
       (do ~@body)))

(defmacro inc (x)
  `(+ ~x 1))

(defmacro dec (x)
  `(- ~x 1))

(defmacro when (test & body)
  `(if ~test
       (do ~@body)
       nil))

(defmacro when-let (binding & body)
  (let (var-name (first binding)
        var-value (second binding))
    `((lambda (~var-name)
         (when ~var-name
             ~@body))
       ~var-value)))

(defmacro print (& args)
  `(console.log ~@args))

(defmacro cons (item lst)
  `(concat (list ~item) ~lst))

(fn concat (arr1 arr2)
  (js-call arr1 "concat" arr2))

(defmacro str (& args)
  (if (empty? args)
      (if (= (length args) 1)
          `(+ "" ~(first args))
          `(+ ~@args))))
  
(defmacro empty? (coll)
  `(or (nil? ~coll)
       (= (length ~coll) 0)))

(defmacro contains? (coll key)
  `(js-call ~coll "has" ~key))

(defmacro nth (coll index)
  `(get ~coll ~index))

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
(import lodash from "npm:lodash")

;; Define a macro that uses lodash's capitalize function
(defmacro capitalize-text (text)
  `(js-call lodash "capitalize" ~text))

;; Test HTTP imports using esm.sh CDN
(import lodash from "https://esm.sh/lodash")

;; Define a macro that uses lodash's uppercase function
(defmacro uppercase-text (text)
  `(js-call lodash "toUpper" ~text))

;; Test HQL imports
(import module from "../examples/dependency-test2/a.hql")
(defmacro text-wrapper (a b) `(module.add3 ~a ~b))

;; (import module from "./test/text-utils.hql")
;; (defmacro text-wrapper (text) `(module.wrap_text ~text))

(import formatter from "./test/formatter.js")
(defmacro js-format-text (text) `(formatter.formatText ~text))

;; (import [formatText] from "./test/formatter.js")
;; (defmacro js-format-text (text) `(formatText ~text))

;; TODO: replace syntax transformer
;; (defmacro fx (name params return-type & body)
;;  `(fx ~name ~params ~return-type ~@body))


;; ====================================================
;; HQL Loop Constructs Library
;; This library implements a series of looping constructs
;; built on the fundamental loop/recur mechanism
;; ====================================================

;; ====================
;; 1. While Loop
;; ====================

;; Simple while loop - repeats body as long as condition is true
;; Example usage:
;; (var count 0)
;; (while (< count 5)
;;   (print count)
;;   (set! count (+ count 1)))
(defmacro while (condition & body)
  `(loop ()
     (if ~condition
       (do
         ~@body
         (recur))
       nil)))

(defmacro for (binding & body)
  (let (var (first binding))
    (if (= (length binding) 2)
      ; Simple case: (for (i n) body) - iterate from 0 to n-1
      `(loop (~var 0)
         (if (< ~var ~(second binding))
           (do
             ~@body
             (recur (+ ~var 1)))
           nil))
      (if (= (length binding) 3)
        ; Medium case: (for (i start end) body) - iterate from start to end-1
        `(loop (~var ~(second binding))
           (if (< ~var ~(get binding 2))
             (do
               ~@body
               (recur (+ ~var 1)))
             nil))
        ; Full case: (for (i start end step) body) - iterate with custom step
        `(loop (~var ~(second binding))
           (if (< ~var ~(get binding 2))
             (do
               ~@body
               (recur (+ ~var ~(get binding 3))))
             nil))))))