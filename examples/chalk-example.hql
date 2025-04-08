// chalk-example.hql - Example of using the chalk module in HQL

// Import the chalk module
(import chalk from "jsr:@nothing628/chalk@1.0.0")

// Direct usage of color methods
(console.log (chalk.green "This text is green!"))
(console.log (chalk.blue.bold "This text is blue and bold!"))
(console.log (chalk.bgRed.white "This text has a red background and white text!"))

// You can also apply multiple styles
(console.log (chalk.yellow.italic.underline "Yellow, italic and underlined text!"))

// Try different color combinations
(def warning chalk.yellow.bold)
(def error chalk.red.bold)
(def info chalk.blue)

(console.log (warning "Warning: This is a warning message"))
(console.log (error "Error: Something went wrong"))
(console.log (info "Info: This is an informational message"))

// List all available colors
(console.log "Chalk has many colors and styles available!") 