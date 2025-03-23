(import _ from "npm:lodash")

(def numbers [1,2,3,4,5,6,7,8,9,10])

(print
  ((((numbers.filter (fn (n) (> n 5))).map (fn (n) (* n 2)))
     .filter (fn (n) (= (% n 4) 0)))
    .reduce (fn (acc n) (+ acc n)) 0)
)

/*
(print
  ((((
    numbers
    .filter (fn (n) (> n 5))).map (fn (n) (* n 2)))
    .filter (fn (n) (= (% n 4) 0)))
    .reduce (fn (acc n) (+ acc n)) 0)
)

;;  => ❌ Error during processing: numbers is not a function
*/

(def direct-chain ((numbers.filter (fn (n) (= (% n 2) 0))).map(fn (n) (* n 2))))
(console.log "Direct chain result:" direct-chain)