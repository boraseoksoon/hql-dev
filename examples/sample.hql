(import chalk "jsr:@nothing628/chalk")
(console.log (chalk.red "chalk!"))

(def joined-path (path.join "folder" "file.txt"))
(console.log joined-path)

(import lodash "npm:lodash")
(print (lodash-capitalize "is it working?"))

(console.log (square-plus-one 10))

(console.log "js-adder : " (js-adder 10 20))