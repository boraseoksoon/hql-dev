;; remote-utils.hql - Utility functions using remote imports

;; Import from HTTP URL
(import dayjs from "https://esm.sh/dayjs")

;; Function that uses the remote import
(fn formatDateTime (date format)
  (let d (if date date (new Date)))
  (let fmt (if format "YYYY-MM-DD HH:mm:ss" format))
  (.format (dayjs d) fmt))

;; Another utility function
(fn timeFromNow (date)
  (let d (if date date (new Date)))
  (.fromNow (dayjs d)))

;; Export the functions
(export [formatDateTime, timeFromNow])

(console.log "remote-utils.hql loaded") 