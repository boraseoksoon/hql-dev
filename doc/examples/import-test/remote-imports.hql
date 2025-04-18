;; remote-imports.hql - Tests remote module imports

;; Import from npm registry
(import lodash from "npm:lodash")
(import [map, filter] from "npm:lodash")

;; Import from JSR registry
(import collections from "jsr:@std/collections")

;; Import from HTTP URL
(import dayjs from "https://esm.sh/dayjs")

(console.log "Remote Imports Test")

;; Test npm imports
(console.log "Lodash version:" lodash.VERSION)
(console.log "Mapped array:" (map [1, 2, 3, 4, 5] (fn (x) (* x 3))))
(console.log "Filtered array:" (filter [1, 2, 3, 4, 5] (fn (x) (> x 2))))

;; Test JSR imports (if available)
(try
  (console.log "Collections available:" (typeof collections))
  (catch e
    (console.log "JSR import test skipped:" e.message)))

;; Test HTTP imports
(try
  (console.log "Current date:" (.format (dayjs)))
  (catch e
    (console.log "HTTP import test skipped:" e.message))) 