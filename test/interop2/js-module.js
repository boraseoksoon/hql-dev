// js-module.js

import { greet } from "./hql-module.js";

export function jsHello(name) {
    return `JavaScript module says: at ${greet(name)}`;
}
