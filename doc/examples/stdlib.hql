;; example-usage.hql - Using the standard library

(import [take, range] from "../../core/lib/stdlib/stdlib.hql")
(take 3 (range 10))

(import chalk from "jsr:@nothing628/chalk@1.0.0")
(console.log (chalk.green "JSR import working!"))