;; Import the values from macro-b
(import macroB "./macro-b.hql")

;; Use the computed values
(console.log "Doubled 5:" macroB.double-five)
(console.log "Doubled and added 5:" macroB.doubled-and-added)