;; macro-a.hql

(import macroB "./macro-b.hql")
(import macroC "./macro-c.hql")

(console.log "macroC.add-man:"  (macroC.addguy 10))

(console.log "Doubled 5:" macroB.double-five)
(console.log "Doubled and added 5:" macroB.doubled-and-added)