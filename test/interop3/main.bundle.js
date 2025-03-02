// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

function greet(name) {
    return "hello, " + name;
}
function jsHello(name) {
    return `JS module processed ${greet(name)}`;
}
const mod = {
    jsHello: jsHello
};
const jsModule = mod.default !== undefined ? mod.default : mod;
const version = "1.0.0";
function process(name) {
    return "Advanced processing for " + name + ": " + jsModule.jsHello(name);
}
const mod1 = {
    process: process,
    version: version
};
const advancedUtils = mod1.default !== undefined ? mod1.default : mod1;
function main(name) {
    return "Main says: " + advancedUtils.process(name) + "\n" + "Version: " + advancedUtils.version;
}
console.log(main("World"));
export { main as main };
