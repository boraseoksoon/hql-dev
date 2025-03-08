;; examples/diverse-dot-notation.hql
;; Comprehensive examples of dot notation for property access and function calls

;; 1. Basic property access
(def screen-width window.innerWidth)
(def screen-height window.innerHeight)

;; 2. Nested property access
(def json-stringify JSON.stringify)
(def navigator-info navigator.userAgent)
(def page-protocol document.location.protocol)

;; 3. No-parameter function calls
(def current-url (window.location.toString))
(def random-num (Math.random))
(def timestamp (Date.now))
(def current-time (new Date))
(def time-string (current-time.toISOString))

;; 4. Property access vs. no-parameter functions
(def array-length [1, 2, 3].length)  ;; property access
(def array-values ([1, 2, 3].values)) ;; no-parameter function call
(def array-keys ([1, 2, 3].keys))     ;; no-parameter function call

(def str-array ["apple", "banana", "cherry"])