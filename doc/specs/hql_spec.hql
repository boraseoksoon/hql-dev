(import express from "npm:express")
(let app (express))                ;; Using default export
(let router (express.Router))      ;; Using named export
(app.use (express.json))           ;; Using named export)