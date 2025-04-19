;; HQL Remote Module
;; This is imported by the TypeScript module

;; Import from local HQL module
(import [hqlRemoteFunctionInternal] from "./local.hql")

;; Import from HTTP directly
(import path from "https://deno.land/std@0.170.0/path/mod.ts")

;; Function that TypeScript will import - reexports from local with enhancement
(fn hqlRemoteFunction (x)
  (console.log "Path from HTTP import:" (path.join "a" "b" "c"))
  
  ;; Call the internal implementation
  (var result (hqlRemoteFunctionInternal x))
  
  ;; Enhance the result
  (+ result 10))

;; Export for TypeScript to import
(export [hqlRemoteFunction]) 