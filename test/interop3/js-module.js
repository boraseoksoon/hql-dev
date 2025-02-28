// js-module.js - JS module that imports HQL
import { greet } from "./hql-module.js";

export function jsHello(name) {
    return `JS module processed ${greet(name)}`;
}