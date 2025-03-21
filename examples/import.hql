;; imports.hql - Test file for all import types

;; Test JSR import
(import chalk "jsr:@nothing628/chalk@1.0.0")
(console.log (chalk.green "JSR import working!"))

;; Test HTTP import
(import path "https://deno.land/std@0.170.0/path/mod.ts")
(def joined-path (path.join "folder" "file.txt"))
(console.log (chalk.green "HTTP import working! Path:" joined-path))