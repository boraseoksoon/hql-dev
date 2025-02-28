;; 1. interop/main.hql
;; The entry point file that imports various types of modules
;; main.hql - Main entry point with various import types

(def hqlMod (import "./hql-module.hql"))  ;; HQL module import
(def jsMod (import "./js-module.js"))     ;; JS module import
(def mathMod (import "npm:mathjs"))       ;; npm module
(def remoteMod (import "https://deno.land/std@0.170.0/path/mod.ts"))
(def jsrMod (import "jsr:@std/path@1.0.8"))  ;; JSR module

(defn main (name)
  (str 
    "HQL says: " (hqlMod.greet name) "\n"
    "JS says: " (jsMod.greet name) "\n"
    "Math says: " (mathMod.round 3.14159) "\n"
    "Remote mod exists: " (not (= remoteMod nil)) "\n"
    "JSR mod exists: " (not (= jsrMod nil))
  )
)

(print (main "World"))

(export "main" main)


;; This set of files creates a complex dependency graph:
;; main.hql → hql-module.hql → hql-submodule.hql
;;                           → js-util.js
;;          → js-module.js → hql-submodule.hql
;;                         → js-util.js
;; 
;; We also have imports from npm, remote HTTP, and JSR