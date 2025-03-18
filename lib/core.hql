;; lib/core.hql

;; Define apply using JS interop.
(def apply (fn (f args)
  (js-call f "apply" null args)))

;; Define concat using & to capture rest parameters.
;; This function takes several list arguments and returns a single, concatenated array.
(def concat (fn (& lists)
  (apply (fn (& all)
           (let (result (new Array))
             (do
               (for (lst all)
                 (for (item lst)
                   (js-call result "push" item))
               result)))
         lists))))

(defmacro join-lists (& lists)
  `(apply concat ~@lists))
