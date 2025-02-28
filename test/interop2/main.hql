;; main.hql
(def jsMod (import "./js-module.js"))

(print (jsMod.jsHello "yo interop"))