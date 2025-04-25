;; export-lib.hql - Demonstrates different export patterns in HQL

;; Define functions to export - use underscores instead of hyphens
(fn add_numbers (x y)
  (+ x y))

(fn multiply_numbers (x y)
  (* x y))

(fn divide_numbers (x y)
  (/ x y))

;; Define a macro to export (user-level)
(macro format_message (msg)
  `(str "MESSAGE: " ~msg))

;; Define variables to export
(let secret_number 42)
(let app_name "HQLTester")

;; Vector-style named exports (recommended approach)
(export [add_numbers, multiply_numbers])
(export [divide_numbers])
(export [secret_number, app_name, format_message])

(console.log "export-lib.hql loaded") 