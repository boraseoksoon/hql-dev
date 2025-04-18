;; TypeScript to JavaScript bridge via HQL
;; This file bridges TS and JS by importing from TS and exporting to JS

;; Import from TS
(import tsModule from "./ts-module.ts")

;; Define a function that uses the TS import
(fn tsJsFunction (x)
  (tsModule.multiplyBy x 3))

;; Export for JS
(export [tsJsFunction]) 