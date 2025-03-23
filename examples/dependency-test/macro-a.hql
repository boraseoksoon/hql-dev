;; macro-a.hql

(import macroB from "./macro-b.hql")

(console.log "macroB : " macroB)

;; Using dot notation with dashed properties (will be auto-transformed to get)
(console.log "Doubled 5:" macroB.double-five)
(console.log "Doubled and added 5:" macroB.doubled-and-added)

;; You can also use get directly (equivalent to above)
(console.log "Using get - Doubled 5:" (get macroB "double-five"))
(console.log "Using get - Doubled and added 5:" (get macroB "doubled-and-added"))