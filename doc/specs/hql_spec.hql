;; hql_spec.hql - Minimal test for set membership bug

(let my-set #[1, 2, 3])
;; (print (my-set 2))         ;; This is the problematic line
(print (js-call my-set "has" 2)) ;; This is the correct JS interop
(print (contains? my-set 2))     ;; If you have a contains? helper

