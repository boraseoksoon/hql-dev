// repl-module-helpers.hql - Helper functions for working with modules in the REPL

// Function to inspect a module and print its structure
(defn inspect-module [moduleName]
  (let [module (eval moduleName)]
    (console.log "Module inspection for:" moduleName)
    (console.log "---------------------------")
    
    (if (not module)
      (console.log "Module not found or undefined")
      (do
        (console.log "Type:" (typeof module))
        
        (if (fn? module)
          (console.log "Function module - can be called directly")
          (console.log "Object module - access properties with dot notation"))
        
        (console.log "\nProperties:")
        (doseq [prop (Object.keys module)]
          (let [val (get module prop)
                type (typeof val)]
            (console.log " -" prop ":" type)))
            
        (if (and module.default (not= module.default undefined))
          (do
            (console.log "\nDefault export found!")
            (console.log "Default export type:" (typeof module.default))
            (console.log "Usage: (" moduleName ".default ...)")
            
            (if (fn? module.default)
              (console.log "The default export is a function and can be called directly"))))
      ))
    (console.log "---------------------------")))

// Function to help with using a new module
(defn module-help [moduleName]
  (let [module (eval moduleName)]
    (console.log "Help for module:" moduleName)
    (console.log "---------------------------")
    
    (if (not module)
      (console.log "Module not found or undefined")
      (do
        ;; Check if it's a chalk-like module
        (if (or (includes? (toLowerCase moduleName) "chalk")
                (and module.colors (array? module.colors)))
          (do
            (console.log "This appears to be a chalk-like module for terminal colors.")
            (console.log "\nUsage examples:")
            (console.log "- Create a new instance: (def myChalk (new" moduleName ".Chalk))")
            (console.log "- Use colors: (myChalk.green \"Colored text\")")
            (console.log "- Chain styles: (myChalk.blue.bold \"Blue and bold\")")
            (console.log "\nAvailable colors:" (or module.foregroundColors module.colors []))
            (if module.modifiers
              (console.log "Available modifiers:" module.modifiers)))
            
          ;; Check if it's express-like
          (if (or (includes? (toLowerCase moduleName) "express")
                  (and (fn? module) (module.Router)))
            (do
              (console.log "This appears to be an Express-like web framework.")
              (console.log "\nUsage examples:")
              (console.log "- Create app: (def app (" moduleName "))")
              (console.log "- Define route: (app.get \"/\" (fn [req res] (res.send \"Hello\")))")
              (console.log "- Start server: (app.listen 3000 (fn [] (console.log \"Server started\")))")
              (console.log "\nCommon properties:")
              (doseq [prop ["Router" "json" "urlencoded" "static"]]
                (if (get module prop)
                  (console.log " -" prop))))
            
            ;; Generic module help
            (do
              (console.log "Generic module. Common usage patterns:")
              (if (fn? module)
                (console.log "- Call function: (" moduleName " ...args)"))
              (console.log "- Access property: (" moduleName ".propertyName)")
              (if (and module.default (fn? module.default))
                (console.log "- Use default export: (" moduleName ".default ...args)"))
              (console.log "\nTop-level properties:")
              (let [props (take 10 (Object.keys module))]
                (doseq [prop props]
                  (console.log " -" prop)))
              (if (> (count (Object.keys module)) 10)
                (console.log " - ... and" (- (count (Object.keys module)) 10) "more properties")))))))
    (console.log "---------------------------")))

// Export these helper functions
(export [inspect-module module-help]) 