(import path "https://deno.land/std@0.170.0/path/mod.ts")

;; Use the path module to join paths
(def joined-path (path.join "folder" "file.txt"))
(console.log joined-path)

;; Import the fs module
(import file "https://deno.land/std@0.170.0/fs/mod.ts")

;; Use the fs module
(def exists (file.existsSync "example-dir"))
(console.log "Directory exists:" exists)

;; Export the joined path
(export "joinedPath" joined-path)

(import express "npm:express")

(def app (express))

(app.get "/" (fn (req res)
  (res.send "Hello World from HQL + Express!")))

(def router (express.Router))

(router.post "/users" (fn (req res)
  (res.status 201)
  (res.send "User created")))

(app.use (express.json))

(import chalk "jsr:@nothing628/chalk")
(console.log (chalk.green "Success!"))
(console.log (chalk.red "Error!"))