;; complex.hql
;; Import local modules (to be inlined)
(def util (import "./util.hql"))
(def helper (import "./helper.js"))

;; Import remote modules (left as ESM imports)
(def remoteMod (import "https://esm.sh/remote-library"))
(def lodash (import "https://esm.sh/lodash"))

(defn processComplex (data)
  (let [ u   (utilProcess data)
         adv (utilAdvanced data)
         h   (helperCalculate data)
         ex  (extraHelperProcess data)
         r   (remoteMod.compute data)
         l   (lodash.chunk (list data u h) 2) ]
    (+ data u adv h ex r (lodash.sum l))
  )
)
(export "processComplex" processComplex)
