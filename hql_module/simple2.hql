(def lodash (import "npm:lodash@4.17.21"))
(def chalk (import "npm:chalk@5.4.1"))

;; Part 3: JS modules and interop examples
(print ((get chalk "blue") "hello hql!"))
(print ((get chalk "red") "hello hql?"))
(print ((get lodash "chunk") (list 1 2 3 4 5 6) 2))