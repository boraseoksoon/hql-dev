;; macro-a.hql

(import macroB from "./macro-b.hql")

(console.log "macroB : " macroB)

;; Using dot notation with dashed properties (will be auto-transformed to get)
(console.log "Doubled 5:" macroB.double_five)
(console.log "Doubled and added 5:" macroB.doubled_and_added)

;; You can also use get directly (equivalent to above)
(console.log "Using get - Doubled 5:" (get macroB "double_five"))
(console.log "Using get - Doubled and added 5:" (get macroB "doubled_and_added"))

(console.log "JS minus : " (macroB.js_minus 10))
(console.log "JS dobule : " (macroB.js_double 10))