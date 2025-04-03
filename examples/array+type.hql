;; Accept an array of strings
(fn process-names (names: [String]) (-> String)
  (. names join ", "))

;; working but check this array syntax 
(fn flatten-matrix (matrix: [Array<Int>]) (-> [Int]) [1,2,3,4,5])
(print (flatten-matrix []))