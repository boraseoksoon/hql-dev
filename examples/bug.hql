;; --- Imports ---
(import express "npm:express")
(def app (express))                ;; Using default export
(def router (express.Router))      ;; Using named export
(app.use (express.json))           ;; Using named export)