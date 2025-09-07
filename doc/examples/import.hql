;; imports.hql - Test file for all import types

;; Test JSR import
(import chalk from "jsr:@nothing628/chalk@1.0.0")
(console.log (chalk.green "JSR import working!"))

;; Prefer JSR std path instead of HTTP for JSR compatibility
(import [join] from "jsr:@std/path@1")
(let joined-path (join "folder" "file.txt"))
(console.log (chalk.green "JSR std/path import working! Path:" joined-path))
