;; Import utils.js for functions
(import utils "./utils.js")

;; Define the macros (no exports needed for internal use)
(defmacro double-it (x)
  (list 'utils.double x))

(defmacro add-one (x)
  (list '+ x 1))

(defmacro double-and-add (x)
  (list '+ (list 'double-it x) 1))

;; Define functions that *use* the macros
(def double-five (double-it 5))
(def doubled-and-added (double-and-add 5))