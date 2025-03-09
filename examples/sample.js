
// HQL Runtime Functions
function list(...args) {
  return args;
}

// Helper for property access
function getProperty(obj, prop) {
  const member = obj[prop];
  return typeof member === "function" ? member.bind(obj) : member;
}
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
const path = (function () {
    const wrapper = pathModule.default !== undefined ? pathModule.default : {};
    for (const [key, value] of Object.entries(pathModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
const joined_path = path.join("folder", "file.txt");
console.log(joined_path);
import * as fileModule from "https://deno.land/std@0.170.0/fs/mod.ts";
const file = (function () {
    const wrapper = fileModule.default !== undefined ? fileModule.default : {};
    for (const [key, value] of Object.entries(fileModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
const exists = file.existsSync("example-dir");
console.log("Directory exists:", exists);
export { joined_path as joinedPath };
import * as expressModule from "npm:express";
const express = (function () {
    const wrapper = expressModule.default !== undefined ? expressModule.default : {};
    for (const [key, value] of Object.entries(expressModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
const app = express();
app.get("/", function (req, res) {
    return res.send("Hello World from HQL + Express!");
});
const router = express.Router();
router.post("/users", function (req, res) {
    res.status(201);
    return res.send("User created");
});
app.use(express.json());
import * as chalkModule from "jsr:@nothing628/chalk";
const chalk = (function () {
    const wrapper = chalkModule.default !== undefined ? chalkModule.default : {};
    for (const [key, value] of Object.entries(chalkModule)) {
        if (key !== "default")
            wrapper[key] = value;
    }
    return wrapper;
})();
console.log(chalk.green("Success!"));
console.log(chalk.red("Error!"));
