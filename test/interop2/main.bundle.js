// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

function greet(name) {
    return "hello, " + name;
}
function jsHello(name) {
    return `JavaScript module says: at ${greet(name)}`;
}
const mod = {
    jsHello: jsHello
};
const jsMod = mod.default !== undefined ? mod.default : mod;
console.log(jsMod.jsHello("yo interop"));
