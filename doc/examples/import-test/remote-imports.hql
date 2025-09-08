;; remote-imports.hql - Tests remote module imports

;; Import from npm registry
(import _ from "npm:lodash")

;; Import from HTTP URL
(import dayjs from "https://esm.sh/dayjs")

(console.log "Remote Imports Test")

;; Test npm imports
(console.log "Lodash version:" _.VERSION)
(console.log "Mapped array:" (_.map [1, 2, 3, 4, 5] (lambda (x) (* x 3))))
(console.log "Filtered array:" (_.filter [1, 2, 3, 4, 5] (lambda (x) (> x 2))))

;; Test HTTP imports
(console.log "Current date:" (.format (dayjs))) 