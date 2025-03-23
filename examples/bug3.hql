(import chalk "jsr:@nothing628/chalk@1.0.0")
(console.log (chalk.green "chalk working!"))

(import [chalk as chalk2] from "jsr:@nothing628/chalk@1.0.0")
(console.log (chalk2.red "chalk2 working!"))