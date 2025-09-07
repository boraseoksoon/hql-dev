// .hql-cache/1/doc/examples/return.ts
console.log("\\n=== Testing Return Behavior in HQL ===\\n");
console.log("\\n## fx Function Return Tests ##\\n");
function implicit_return_fx(...args) {
  let x = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["x"] !== void 0)
      x = args[0]["x"];
    if (x === void 0 && args.length > 0)
      x = args[0];
  } else {
    if (args.length > 0)
      x = args[0];
  }
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  return function() {
    const doubled = x * 2;
    doubled;
    return doubled;
  }();
}
console.log("fx implicit return: ", implicit_return_fx(5));
function explicit_return_fx(...args) {
  let x = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["x"] !== void 0)
      x = args[0]["x"];
    if (x === void 0 && args.length > 0)
      x = args[0];
  } else {
    if (args.length > 0)
      x = args[0];
  }
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  return function() {
    const doubled = x * 2;
    return doubled;
  }();
}
console.log("fx explicit return: ", explicit_return_fx(5));
function early_return_fx(...args) {
  let x = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["x"] !== void 0)
      x = args[0]["x"];
    if (x === void 0 && args.length > 0)
      x = args[0];
  } else {
    if (args.length > 0)
      x = args[0];
  }
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  return x < 0 ? (() => 0)() : x * 2;
}
console.log("fx early return (negative): ", early_return_fx(-5));
console.log("fx no early return (positive): ", early_return_fx(5));
function multi_return_fx(...args) {
  let x = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["x"] !== void 0)
      x = args[0]["x"];
    if (x === void 0 && args.length > 0)
      x = args[0];
  } else {
    if (args.length > 0)
      x = args[0];
  }
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  return x < 0 ? (() => 0)() : x > 10 ? (() => 100)() : (() => x)();
}
console.log("fx multi-return (negative): ", multi_return_fx(-5));
console.log("fx multi-return (large): ", multi_return_fx(15));
console.log("fx multi-return (normal): ", multi_return_fx(7));
function mixed_return_fx(...args) {
  let x = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["x"] !== void 0)
      x = args[0]["x"];
    if (x === void 0 && args.length > 0)
      x = args[0];
  } else {
    if (args.length > 0)
      x = args[0];
  }
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  return x < 0 ? (() => 0)() : x * 2;
}
console.log("fx mixed return (negative): ", mixed_return_fx(-5));
console.log("fx mixed return (positive): ", mixed_return_fx(5));
console.log("\\n## fn Function Return Tests ##\\n");
function implicit_return_fn(x) {
  return function() {
    const doubled = x * 2;
    doubled;
    return doubled;
  }();
}
console.log("fn implicit return: ", implicit_return_fn(5));
function explicit_return_fn(x) {
  return function() {
    const doubled = x * 2;
    return doubled;
  }();
}
console.log("fn explicit return: ", explicit_return_fn(5));
function early_return_fn(x) {
  return x < 0 ? (() => 0)() : x * 2;
}
console.log("fn early return (negative): ", early_return_fn(-5));
console.log("fn no early return (positive): ", early_return_fn(5));
function multi_return_fn(x) {
  return x < 0 ? (() => 0)() : x > 10 ? (() => 100)() : (() => x)();
}
console.log("fn multi-return (negative): ", multi_return_fn(-5));
console.log("fn multi-return (large): ", multi_return_fn(15));
console.log("fn multi-return (normal): ", multi_return_fn(7));
function mixed_return_fn(x) {
  return x < 0 ? (() => 0)() : x * 2;
}
console.log("fn mixed return (negative): ", mixed_return_fn(-5));
console.log("fn mixed return (positive): ", mixed_return_fn(5));
console.log("\\n## Lambda Return Tests ##\\n");
(function() {
  const implicit_lambda = function(x) {
    return x * 2;
  };
  console.log("lambda implicit return: ", (() => {
    try {
      const result = implicit_lambda[5];
      return result !== void 0 ? result : implicit_lambda(5);
    } catch (_) {
      return implicit_lambda(5);
    }
  })());
  return console.log("lambda implicit return: ", (() => {
    try {
      const result = implicit_lambda[5];
      return result !== void 0 ? result : implicit_lambda(5);
    } catch (_) {
      return implicit_lambda(5);
    }
  })());
})();
(function() {
  const explicit_lambda = function(x) {
    return x * 2;
  };
  console.log("lambda explicit return: ", (() => {
    try {
      const result = explicit_lambda[5];
      return result !== void 0 ? result : explicit_lambda(5);
    } catch (_) {
      return explicit_lambda(5);
    }
  })());
  return console.log("lambda explicit return: ", (() => {
    try {
      const result = explicit_lambda[5];
      return result !== void 0 ? result : explicit_lambda(5);
    } catch (_) {
      return explicit_lambda(5);
    }
  })());
})();
(function() {
  const early_lambda = function(x) {
    return x < 0 ? (() => 0)() : x * 2;
  };
  console.log("lambda early return (negative): ", (() => {
    try {
      const result = early_lambda[-5];
      return result !== void 0 ? result : early_lambda(-5);
    } catch (_) {
      return early_lambda(-5);
    }
  })());
  console.log("lambda no early return (positive): ", (() => {
    try {
      const result = early_lambda[5];
      return result !== void 0 ? result : early_lambda(5);
    } catch (_) {
      return early_lambda(5);
    }
  })());
  return console.log("lambda no early return (positive): ", (() => {
    try {
      const result = early_lambda[5];
      return result !== void 0 ? result : early_lambda(5);
    } catch (_) {
      return early_lambda(5);
    }
  })());
})();
(function() {
  const multi_lambda = function(x) {
    return function() {
      const a = x * 2;
      (function() {
        const b = a + 1;
        b;
        return b;
      })();
      return function() {
        const b = a + 1;
        b;
        return b;
      }();
    }();
  };
  console.log("lambda multi-statement: ", (() => {
    try {
      const result = multi_lambda[5];
      return result !== void 0 ? result : multi_lambda(5);
    } catch (_) {
      return multi_lambda(5);
    }
  })());
  return console.log("lambda multi-statement: ", (() => {
    try {
      const result = multi_lambda[5];
      return result !== void 0 ? result : multi_lambda(5);
    } catch (_) {
      return multi_lambda(5);
    }
  })());
})();
(function() {
  const multi_explicit_lambda = function(x) {
    return function() {
      const a = x * 2;
      (function() {
        const b = a + 1;
        return b;
      })();
      return function() {
        const b = a + 1;
        return b;
      }();
    }();
  };
  console.log("lambda multi-statement explicit: ", (() => {
    try {
      const result = multi_explicit_lambda[5];
      return result !== void 0 ? result : multi_explicit_lambda(5);
    } catch (_) {
      return multi_explicit_lambda(5);
    }
  })());
  return console.log("lambda multi-statement explicit: ", (() => {
    try {
      const result = multi_explicit_lambda[5];
      return result !== void 0 ? result : multi_explicit_lambda(5);
    } catch (_) {
      return multi_explicit_lambda(5);
    }
  })());
})();
console.log("\\n## Nested Function Return Tests ##\\n");
function nested_fn_lambda(x) {
  return function() {
    const inner_lambda = function(y) {
      return y < 0 ? (() => 0)() : y * 2;
    };
    inner_lambda(x);
    return inner_lambda(x);
  }();
}
console.log("nested fn/lambda (negative): ", nested_fn_lambda(-5));
console.log("nested fn/lambda (positive): ", nested_fn_lambda(5));
function nested_fx_lambda(...args) {
  let x = 0;
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0])) {
    if (args[0]["x"] !== void 0)
      x = args[0]["x"];
    if (x === void 0 && args.length > 0)
      x = args[0];
  } else {
    if (args.length > 0)
      x = args[0];
  }
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  x = typeof x === "object" && x !== null ? JSON.parse(JSON.stringify(x)) : x;
  return function() {
    const inner_lambda = function(y) {
      return y < 0 ? (() => 0)() : y * 2;
    };
    return inner_lambda(x);
  }();
}
console.log("nested fx/lambda (negative): ", nested_fx_lambda(-5));
console.log("nested fx/lambda (positive): ", nested_fx_lambda(5));
function complex_nested(condition) {
  return function() {
    const inner_fn = function(x) {
      return x < 0 ? (() => -1)() : x * 2;
    };
    condition ? (() => {
      try {
        const result = inner_fn[5];
        return result !== void 0 ? result : inner_fn(5);
      } catch (_) {
        return inner_fn(5);
      }
    })() : (() => -999)();
    return condition ? (() => {
      try {
        const result = inner_fn[5];
        return result !== void 0 ? result : inner_fn(5);
      } catch (_) {
        return inner_fn(5);
      }
    })() : (() => -999)();
  }();
}
console.log("complex nested (true): ", complex_nested(true));
console.log("complex nested (false): ", complex_nested(false));
console.log("\\n## Return Edge Cases ##\\n");
function empty_with_return() {
  return 42;
}
console.log("empty body with return: ", empty_with_return());
function nested_block_return(x) {
  return function() {
    const a = 10;
    (function() {
      const b = 20;
      x > 0 ? (() => a + b)() : a - b;
      return x > 0 ? (() => a + b)() : a - b;
    })();
    return function() {
      const b = 20;
      x > 0 ? (() => a + b)() : a - b;
      return x > 0 ? (() => a + b)() : a - b;
    }();
  }();
}
console.log("nested block return (positive): ", nested_block_return(5));
console.log("nested block return (negative): ", nested_block_return(-5));
function return_complex() {
  return {
    name: "John",
    age: 30,
    scores: [85, 90, 95]
  };
}
console.log("return complex: ", return_complex());
function sequential_returns(x) {
  return x + 1;
}
console.log("sequential returns: ", sequential_returns(10));
function sequential_returns2(x) {
  x + 1;
  return x + 2;
}
console.log("sequential returns: ", sequential_returns2(10));
function sequential_returns3(x) {
  x + 1;
  x + 2;
  return x + 3;
}
console.log("sequential returns: ", sequential_returns3(10));
function deep_conditional_return(x) {
  return x > 10 ? x > 20 ? x > 30 ? "very large" : "large" : "medium" : "small";
}
console.log("deep conditional (40): ", deep_conditional_return(40));
console.log("deep conditional (25): ", deep_conditional_return(25));
console.log("deep conditional (15): ", deep_conditional_return(15));
console.log("deep conditional (5): ", deep_conditional_return(5));
console.log("\\n## Return in Function Arguments ##\\n");
function add_one(x) {
  return x + 1;
}
function return_as_arg(condition) {
  return add_one(condition ? 10 : (() => 0)());
}
console.log("return as argument (true): ", return_as_arg(true));
console.log("return as argument (false): ", return_as_arg(false));
console.log("\\n## Function Composition with Return ##\\n");
function outer(x) {
  return function() {
    const result = middle(x);
    result + 1e3;
    return result + 1e3;
  }();
}
function middle(x) {
  return x < 0 ? (() => -1)() : inner(x);
}
function inner(x) {
  return x < 10 ? (() => 0)() : x * 10;
}
console.log("function chain (negative): ", outer(-5));
console.log("function chain (small): ", outer(5));
console.log("function chain (large): ", outer(15));
console.log("\\n=== Return Tests Complete ===\\n");
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9yZXR1cm4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnNvbGUubG9nKFwiXFxcXG49PT0gVGVzdGluZyBSZXR1cm4gQmVoYXZpb3IgaW4gSFFMID09PVxcXFxuXCIpO1xuY29uc29sZS5sb2coXCJcXFxcbiMjIGZ4IEZ1bmN0aW9uIFJldHVybiBUZXN0cyAjI1xcXFxuXCIpO1xuZnVuY3Rpb24gaW1wbGljaXRfcmV0dXJuX2Z4KC4uLmFyZ3MpIHtcbiAgICBsZXQgeCA9IDA7XG4gICAgaWYgKGFyZ3MubGVuZ3RoID09PSAxICYmIHR5cGVvZiBhcmdzWzBdID09PSBcIm9iamVjdFwiICYmIGFyZ3NbMF0gIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkoYXJnc1swXSkpIHtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJ4XCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB4ID0gYXJnc1swXVtcInhcIl07XG4gICAgICAgIGlmICh4ID09PSB1bmRlZmluZWQgJiYgYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgeCA9IGFyZ3NbMF07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgeCA9IGFyZ3NbMF07XG4gICAgfVxuICAgIHggPSB0eXBlb2YgeCA9PT0gXCJvYmplY3RcIiAmJiB4ICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh4KSkgOiB4O1xuICAgIHggPSB0eXBlb2YoeCkgPT09IFwib2JqZWN0XCIgJiYgeCAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeCkpIDogeDtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBkb3VibGVkID0geCAqIDI7XG4gICAgICAgIGRvdWJsZWQ7XG4gICAgICAgIHJldHVybiBkb3VibGVkO1xuICAgIH0oKTtcbn1cbmNvbnNvbGUubG9nKFwiZnggaW1wbGljaXQgcmV0dXJuOiBcIiwgaW1wbGljaXRfcmV0dXJuX2Z4KDUpKTtcbmZ1bmN0aW9uIGV4cGxpY2l0X3JldHVybl9meCguLi5hcmdzKSB7XG4gICAgbGV0IHggPSAwO1xuICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgYXJnc1swXSA9PT0gXCJvYmplY3RcIiAmJiBhcmdzWzBdICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KGFyZ3NbMF0pKSB7XG4gICAgICAgIGlmIChhcmdzWzBdW1wieFwiXSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgeCA9IGFyZ3NbMF1bXCJ4XCJdO1xuICAgICAgICBpZiAoeCA9PT0gdW5kZWZpbmVkICYmIGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHggPSBhcmdzWzBdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHggPSBhcmdzWzBdO1xuICAgIH1cbiAgICB4ID0gdHlwZW9mIHggPT09IFwib2JqZWN0XCIgJiYgeCAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeCkpIDogeDtcbiAgICB4ID0gdHlwZW9mKHgpID09PSBcIm9iamVjdFwiICYmIHggIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHgpKSA6IHg7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29uc3QgZG91YmxlZCA9IHggKiAyO1xuICAgICAgICByZXR1cm4gZG91YmxlZDtcbiAgICB9KCk7XG59XG5jb25zb2xlLmxvZyhcImZ4IGV4cGxpY2l0IHJldHVybjogXCIsIGV4cGxpY2l0X3JldHVybl9meCg1KSk7XG5mdW5jdGlvbiBlYXJseV9yZXR1cm5fZngoLi4uYXJncykge1xuICAgIGxldCB4ID0gMDtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcInhcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHggPSBhcmdzWzBdW1wieFwiXTtcbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCAmJiBhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB4ID0gYXJnc1swXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB4ID0gYXJnc1swXTtcbiAgICB9XG4gICAgeCA9IHR5cGVvZiB4ID09PSBcIm9iamVjdFwiICYmIHggIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHgpKSA6IHg7XG4gICAgeCA9IHR5cGVvZih4KSA9PT0gXCJvYmplY3RcIiAmJiB4ICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh4KSkgOiB4O1xuICAgIHJldHVybiB4IDwgMCA/ICgoKSA9PiAwKSgpIDogeCAqIDI7XG59XG5jb25zb2xlLmxvZyhcImZ4IGVhcmx5IHJldHVybiAobmVnYXRpdmUpOiBcIiwgZWFybHlfcmV0dXJuX2Z4KC01KSk7XG5jb25zb2xlLmxvZyhcImZ4IG5vIGVhcmx5IHJldHVybiAocG9zaXRpdmUpOiBcIiwgZWFybHlfcmV0dXJuX2Z4KDUpKTtcbmZ1bmN0aW9uIG11bHRpX3JldHVybl9meCguLi5hcmdzKSB7XG4gICAgbGV0IHggPSAwO1xuICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgYXJnc1swXSA9PT0gXCJvYmplY3RcIiAmJiBhcmdzWzBdICE9PSBudWxsICYmICFBcnJheS5pc0FycmF5KGFyZ3NbMF0pKSB7XG4gICAgICAgIGlmIChhcmdzWzBdW1wieFwiXSAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgeCA9IGFyZ3NbMF1bXCJ4XCJdO1xuICAgICAgICBpZiAoeCA9PT0gdW5kZWZpbmVkICYmIGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHggPSBhcmdzWzBdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMClcbiAgICAgICAgICAgIHggPSBhcmdzWzBdO1xuICAgIH1cbiAgICB4ID0gdHlwZW9mIHggPT09IFwib2JqZWN0XCIgJiYgeCAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeCkpIDogeDtcbiAgICB4ID0gdHlwZW9mKHgpID09PSBcIm9iamVjdFwiICYmIHggIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHgpKSA6IHg7XG4gICAgcmV0dXJuIHggPCAwID8gKCgpID0+IDApKCkgOiB4ID4gMTAgPyAoKCkgPT4gMTAwKSgpIDogKCgpID0+IHgpKCk7XG59XG5jb25zb2xlLmxvZyhcImZ4IG11bHRpLXJldHVybiAobmVnYXRpdmUpOiBcIiwgbXVsdGlfcmV0dXJuX2Z4KC01KSk7XG5jb25zb2xlLmxvZyhcImZ4IG11bHRpLXJldHVybiAobGFyZ2UpOiBcIiwgbXVsdGlfcmV0dXJuX2Z4KDE1KSk7XG5jb25zb2xlLmxvZyhcImZ4IG11bHRpLXJldHVybiAobm9ybWFsKTogXCIsIG11bHRpX3JldHVybl9meCg3KSk7XG5mdW5jdGlvbiBtaXhlZF9yZXR1cm5fZngoLi4uYXJncykge1xuICAgIGxldCB4ID0gMDtcbiAgICBpZiAoYXJncy5sZW5ndGggPT09IDEgJiYgdHlwZW9mIGFyZ3NbMF0gPT09IFwib2JqZWN0XCIgJiYgYXJnc1swXSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShhcmdzWzBdKSkge1xuICAgICAgICBpZiAoYXJnc1swXVtcInhcIl0gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHggPSBhcmdzWzBdW1wieFwiXTtcbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCAmJiBhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB4ID0gYXJnc1swXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDApXG4gICAgICAgICAgICB4ID0gYXJnc1swXTtcbiAgICB9XG4gICAgeCA9IHR5cGVvZiB4ID09PSBcIm9iamVjdFwiICYmIHggIT09IG51bGwgPyBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHgpKSA6IHg7XG4gICAgeCA9IHR5cGVvZih4KSA9PT0gXCJvYmplY3RcIiAmJiB4ICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh4KSkgOiB4O1xuICAgIHJldHVybiB4IDwgMCA/ICgoKSA9PiAwKSgpIDogeCAqIDI7XG59XG5jb25zb2xlLmxvZyhcImZ4IG1peGVkIHJldHVybiAobmVnYXRpdmUpOiBcIiwgbWl4ZWRfcmV0dXJuX2Z4KC01KSk7XG5jb25zb2xlLmxvZyhcImZ4IG1peGVkIHJldHVybiAocG9zaXRpdmUpOiBcIiwgbWl4ZWRfcmV0dXJuX2Z4KDUpKTtcbmNvbnNvbGUubG9nKFwiXFxcXG4jIyBmbiBGdW5jdGlvbiBSZXR1cm4gVGVzdHMgIyNcXFxcblwiKTtcbmZ1bmN0aW9uIGltcGxpY2l0X3JldHVybl9mbih4KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29uc3QgZG91YmxlZCA9IHggKiAyO1xuICAgICAgICBkb3VibGVkO1xuICAgICAgICByZXR1cm4gZG91YmxlZDtcbiAgICB9KCk7XG59XG5jb25zb2xlLmxvZyhcImZuIGltcGxpY2l0IHJldHVybjogXCIsIGltcGxpY2l0X3JldHVybl9mbig1KSk7XG5mdW5jdGlvbiBleHBsaWNpdF9yZXR1cm5fZm4oeCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNvbnN0IGRvdWJsZWQgPSB4ICogMjtcbiAgICAgICAgcmV0dXJuIGRvdWJsZWQ7XG4gICAgfSgpO1xufVxuY29uc29sZS5sb2coXCJmbiBleHBsaWNpdCByZXR1cm46IFwiLCBleHBsaWNpdF9yZXR1cm5fZm4oNSkpO1xuZnVuY3Rpb24gZWFybHlfcmV0dXJuX2ZuKHgpIHtcbiAgICByZXR1cm4geCA8IDAgPyAoKCkgPT4gMCkoKSA6IHggKiAyO1xufVxuY29uc29sZS5sb2coXCJmbiBlYXJseSByZXR1cm4gKG5lZ2F0aXZlKTogXCIsIGVhcmx5X3JldHVybl9mbigtNSkpO1xuY29uc29sZS5sb2coXCJmbiBubyBlYXJseSByZXR1cm4gKHBvc2l0aXZlKTogXCIsIGVhcmx5X3JldHVybl9mbig1KSk7XG5mdW5jdGlvbiBtdWx0aV9yZXR1cm5fZm4oeCkge1xuICAgIHJldHVybiB4IDwgMCA/ICgoKSA9PiAwKSgpIDogeCA+IDEwID8gKCgpID0+IDEwMCkoKSA6ICgoKSA9PiB4KSgpO1xufVxuY29uc29sZS5sb2coXCJmbiBtdWx0aS1yZXR1cm4gKG5lZ2F0aXZlKTogXCIsIG11bHRpX3JldHVybl9mbigtNSkpO1xuY29uc29sZS5sb2coXCJmbiBtdWx0aS1yZXR1cm4gKGxhcmdlKTogXCIsIG11bHRpX3JldHVybl9mbigxNSkpO1xuY29uc29sZS5sb2coXCJmbiBtdWx0aS1yZXR1cm4gKG5vcm1hbCk6IFwiLCBtdWx0aV9yZXR1cm5fZm4oNykpO1xuZnVuY3Rpb24gbWl4ZWRfcmV0dXJuX2ZuKHgpIHtcbiAgICByZXR1cm4geCA8IDAgPyAoKCkgPT4gMCkoKSA6IHggKiAyO1xufVxuY29uc29sZS5sb2coXCJmbiBtaXhlZCByZXR1cm4gKG5lZ2F0aXZlKTogXCIsIG1peGVkX3JldHVybl9mbigtNSkpO1xuY29uc29sZS5sb2coXCJmbiBtaXhlZCByZXR1cm4gKHBvc2l0aXZlKTogXCIsIG1peGVkX3JldHVybl9mbig1KSk7XG5jb25zb2xlLmxvZyhcIlxcXFxuIyMgTGFtYmRhIFJldHVybiBUZXN0cyAjI1xcXFxuXCIpO1xuKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBpbXBsaWNpdF9sYW1iZGEgPSBmdW5jdGlvbiAoeCkge1xuICAgICAgICByZXR1cm4geCAqIDI7XG4gICAgfTtcbiAgICBjb25zb2xlLmxvZyhcImxhbWJkYSBpbXBsaWNpdCByZXR1cm46IFwiLCAoKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gaW1wbGljaXRfbGFtYmRhWzVdO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdCAhPT0gdW5kZWZpbmVkID8gcmVzdWx0IDogaW1wbGljaXRfbGFtYmRhKDUpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChfKSB7XG4gICAgICAgICAgICByZXR1cm4gaW1wbGljaXRfbGFtYmRhKDUpO1xuICAgICAgICB9XG4gICAgfSkoKSk7XG4gICAgcmV0dXJuIGNvbnNvbGUubG9nKFwibGFtYmRhIGltcGxpY2l0IHJldHVybjogXCIsICgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBpbXBsaWNpdF9sYW1iZGFbNV07XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0ICE9PSB1bmRlZmluZWQgPyByZXN1bHQgOiBpbXBsaWNpdF9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKF8pIHtcbiAgICAgICAgICAgIHJldHVybiBpbXBsaWNpdF9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICB9KSgpKTtcbn0pKCk7XG4oZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IGV4cGxpY2l0X2xhbWJkYSA9IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgIHJldHVybiB4ICogMjtcbiAgICB9O1xuICAgIGNvbnNvbGUubG9nKFwibGFtYmRhIGV4cGxpY2l0IHJldHVybjogXCIsICgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBleHBsaWNpdF9sYW1iZGFbNV07XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0ICE9PSB1bmRlZmluZWQgPyByZXN1bHQgOiBleHBsaWNpdF9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKF8pIHtcbiAgICAgICAgICAgIHJldHVybiBleHBsaWNpdF9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICB9KSgpKTtcbiAgICByZXR1cm4gY29uc29sZS5sb2coXCJsYW1iZGEgZXhwbGljaXQgcmV0dXJuOiBcIiwgKCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGV4cGxpY2l0X2xhbWJkYVs1XTtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQgIT09IHVuZGVmaW5lZCA/IHJlc3VsdCA6IGV4cGxpY2l0X2xhbWJkYSg1KTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgcmV0dXJuIGV4cGxpY2l0X2xhbWJkYSg1KTtcbiAgICAgICAgfVxuICAgIH0pKCkpO1xufSkoKTtcbihmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgZWFybHlfbGFtYmRhID0gZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgcmV0dXJuIHggPCAwID8gKCgpID0+IDApKCkgOiB4ICogMjtcbiAgICB9O1xuICAgIGNvbnNvbGUubG9nKFwibGFtYmRhIGVhcmx5IHJldHVybiAobmVnYXRpdmUpOiBcIiwgKCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGVhcmx5X2xhbWJkYVstNV07XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0ICE9PSB1bmRlZmluZWQgPyByZXN1bHQgOiBlYXJseV9sYW1iZGEoLTUpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChfKSB7XG4gICAgICAgICAgICByZXR1cm4gZWFybHlfbGFtYmRhKC01KTtcbiAgICAgICAgfVxuICAgIH0pKCkpO1xuICAgIGNvbnNvbGUubG9nKFwibGFtYmRhIG5vIGVhcmx5IHJldHVybiAocG9zaXRpdmUpOiBcIiwgKCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGVhcmx5X2xhbWJkYVs1XTtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQgIT09IHVuZGVmaW5lZCA/IHJlc3VsdCA6IGVhcmx5X2xhbWJkYSg1KTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgcmV0dXJuIGVhcmx5X2xhbWJkYSg1KTtcbiAgICAgICAgfVxuICAgIH0pKCkpO1xuICAgIHJldHVybiBjb25zb2xlLmxvZyhcImxhbWJkYSBubyBlYXJseSByZXR1cm4gKHBvc2l0aXZlKTogXCIsICgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBlYXJseV9sYW1iZGFbNV07XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0ICE9PSB1bmRlZmluZWQgPyByZXN1bHQgOiBlYXJseV9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKF8pIHtcbiAgICAgICAgICAgIHJldHVybiBlYXJseV9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICB9KSgpKTtcbn0pKCk7XG4oZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IG11bHRpX2xhbWJkYSA9IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCBhID0geCAqIDI7XG4gICAgICAgICAgICAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGIgPSBhICsgMTtcbiAgICAgICAgICAgICAgICBiO1xuICAgICAgICAgICAgICAgIHJldHVybiBiO1xuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IGEgKyAxO1xuICAgICAgICAgICAgICAgIGI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGI7XG4gICAgICAgICAgICB9KCk7XG4gICAgICAgIH0oKTtcbiAgICB9O1xuICAgIGNvbnNvbGUubG9nKFwibGFtYmRhIG11bHRpLXN0YXRlbWVudDogXCIsICgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBtdWx0aV9sYW1iZGFbNV07XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0ICE9PSB1bmRlZmluZWQgPyByZXN1bHQgOiBtdWx0aV9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKF8pIHtcbiAgICAgICAgICAgIHJldHVybiBtdWx0aV9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICB9KSgpKTtcbiAgICByZXR1cm4gY29uc29sZS5sb2coXCJsYW1iZGEgbXVsdGktc3RhdGVtZW50OiBcIiwgKCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IG11bHRpX2xhbWJkYVs1XTtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQgIT09IHVuZGVmaW5lZCA/IHJlc3VsdCA6IG11bHRpX2xhbWJkYSg1KTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgcmV0dXJuIG11bHRpX2xhbWJkYSg1KTtcbiAgICAgICAgfVxuICAgIH0pKCkpO1xufSkoKTtcbihmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgbXVsdGlfZXhwbGljaXRfbGFtYmRhID0gZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSB4ICogMjtcbiAgICAgICAgICAgIChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IGEgKyAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBiO1xuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYiA9IGEgKyAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBiO1xuICAgICAgICAgICAgfSgpO1xuICAgICAgICB9KCk7XG4gICAgfTtcbiAgICBjb25zb2xlLmxvZyhcImxhbWJkYSBtdWx0aS1zdGF0ZW1lbnQgZXhwbGljaXQ6IFwiLCAoKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gbXVsdGlfZXhwbGljaXRfbGFtYmRhWzVdO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdCAhPT0gdW5kZWZpbmVkID8gcmVzdWx0IDogbXVsdGlfZXhwbGljaXRfbGFtYmRhKDUpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChfKSB7XG4gICAgICAgICAgICByZXR1cm4gbXVsdGlfZXhwbGljaXRfbGFtYmRhKDUpO1xuICAgICAgICB9XG4gICAgfSkoKSk7XG4gICAgcmV0dXJuIGNvbnNvbGUubG9nKFwibGFtYmRhIG11bHRpLXN0YXRlbWVudCBleHBsaWNpdDogXCIsICgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBtdWx0aV9leHBsaWNpdF9sYW1iZGFbNV07XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0ICE9PSB1bmRlZmluZWQgPyByZXN1bHQgOiBtdWx0aV9leHBsaWNpdF9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKF8pIHtcbiAgICAgICAgICAgIHJldHVybiBtdWx0aV9leHBsaWNpdF9sYW1iZGEoNSk7XG4gICAgICAgIH1cbiAgICB9KSgpKTtcbn0pKCk7XG5jb25zb2xlLmxvZyhcIlxcXFxuIyMgTmVzdGVkIEZ1bmN0aW9uIFJldHVybiBUZXN0cyAjI1xcXFxuXCIpO1xuZnVuY3Rpb24gbmVzdGVkX2ZuX2xhbWJkYSh4KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29uc3QgaW5uZXJfbGFtYmRhID0gZnVuY3Rpb24gKHkpIHtcbiAgICAgICAgICAgIHJldHVybiB5IDwgMCA/ICgoKSA9PiAwKSgpIDogeSAqIDI7XG4gICAgICAgIH07XG4gICAgICAgIGlubmVyX2xhbWJkYSh4KTtcbiAgICAgICAgcmV0dXJuIGlubmVyX2xhbWJkYSh4KTtcbiAgICB9KCk7XG59XG5jb25zb2xlLmxvZyhcIm5lc3RlZCBmbi9sYW1iZGEgKG5lZ2F0aXZlKTogXCIsIG5lc3RlZF9mbl9sYW1iZGEoLTUpKTtcbmNvbnNvbGUubG9nKFwibmVzdGVkIGZuL2xhbWJkYSAocG9zaXRpdmUpOiBcIiwgbmVzdGVkX2ZuX2xhbWJkYSg1KSk7XG5mdW5jdGlvbiBuZXN0ZWRfZnhfbGFtYmRhKC4uLmFyZ3MpIHtcbiAgICBsZXQgeCA9IDA7XG4gICAgaWYgKGFyZ3MubGVuZ3RoID09PSAxICYmIHR5cGVvZiBhcmdzWzBdID09PSBcIm9iamVjdFwiICYmIGFyZ3NbMF0gIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkoYXJnc1swXSkpIHtcbiAgICAgICAgaWYgKGFyZ3NbMF1bXCJ4XCJdICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB4ID0gYXJnc1swXVtcInhcIl07XG4gICAgICAgIGlmICh4ID09PSB1bmRlZmluZWQgJiYgYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgeCA9IGFyZ3NbMF07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAoYXJncy5sZW5ndGggPiAwKVxuICAgICAgICAgICAgeCA9IGFyZ3NbMF07XG4gICAgfVxuICAgIHggPSB0eXBlb2YgeCA9PT0gXCJvYmplY3RcIiAmJiB4ICE9PSBudWxsID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh4KSkgOiB4O1xuICAgIHggPSB0eXBlb2YoeCkgPT09IFwib2JqZWN0XCIgJiYgeCAhPT0gbnVsbCA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoeCkpIDogeDtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBpbm5lcl9sYW1iZGEgPSBmdW5jdGlvbiAoeSkge1xuICAgICAgICAgICAgcmV0dXJuIHkgPCAwID8gKCgpID0+IDApKCkgOiB5ICogMjtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGlubmVyX2xhbWJkYSh4KTtcbiAgICB9KCk7XG59XG5jb25zb2xlLmxvZyhcIm5lc3RlZCBmeC9sYW1iZGEgKG5lZ2F0aXZlKTogXCIsIG5lc3RlZF9meF9sYW1iZGEoLTUpKTtcbmNvbnNvbGUubG9nKFwibmVzdGVkIGZ4L2xhbWJkYSAocG9zaXRpdmUpOiBcIiwgbmVzdGVkX2Z4X2xhbWJkYSg1KSk7XG5mdW5jdGlvbiBjb21wbGV4X25lc3RlZChjb25kaXRpb24pIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBpbm5lcl9mbiA9IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgICAgICByZXR1cm4geCA8IDAgPyAoKCkgPT4gLTEpKCkgOiB4ICogMjtcbiAgICAgICAgfTtcbiAgICAgICAgY29uZGl0aW9uID8gKCgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gaW5uZXJfZm5bNV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdCAhPT0gdW5kZWZpbmVkID8gcmVzdWx0IDogaW5uZXJfZm4oNSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbm5lcl9mbig1KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkoKSA6ICgoKSA9PiAtOTk5KSgpO1xuICAgICAgICByZXR1cm4gY29uZGl0aW9uID8gKCgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gaW5uZXJfZm5bNV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdCAhPT0gdW5kZWZpbmVkID8gcmVzdWx0IDogaW5uZXJfZm4oNSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbm5lcl9mbig1KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkoKSA6ICgoKSA9PiAtOTk5KSgpO1xuICAgIH0oKTtcbn1cbmNvbnNvbGUubG9nKFwiY29tcGxleCBuZXN0ZWQgKHRydWUpOiBcIiwgY29tcGxleF9uZXN0ZWQodHJ1ZSkpO1xuY29uc29sZS5sb2coXCJjb21wbGV4IG5lc3RlZCAoZmFsc2UpOiBcIiwgY29tcGxleF9uZXN0ZWQoZmFsc2UpKTtcbmNvbnNvbGUubG9nKFwiXFxcXG4jIyBSZXR1cm4gRWRnZSBDYXNlcyAjI1xcXFxuXCIpO1xuZnVuY3Rpb24gZW1wdHlfd2l0aF9yZXR1cm4oKSB7XG4gICAgcmV0dXJuIDQyO1xufVxuY29uc29sZS5sb2coXCJlbXB0eSBib2R5IHdpdGggcmV0dXJuOiBcIiwgZW1wdHlfd2l0aF9yZXR1cm4oKSk7XG5mdW5jdGlvbiBuZXN0ZWRfYmxvY2tfcmV0dXJuKHgpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBjb25zdCBhID0gMTA7XG4gICAgICAgIChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCBiID0gMjA7XG4gICAgICAgICAgICB4ID4gMCA/ICgoKSA9PiBhICsgYikoKSA6IGEgLSBiO1xuICAgICAgICAgICAgcmV0dXJuIHggPiAwID8gKCgpID0+IGEgKyBiKSgpIDogYSAtIGI7XG4gICAgICAgIH0pKCk7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zdCBiID0gMjA7XG4gICAgICAgICAgICB4ID4gMCA/ICgoKSA9PiBhICsgYikoKSA6IGEgLSBiO1xuICAgICAgICAgICAgcmV0dXJuIHggPiAwID8gKCgpID0+IGEgKyBiKSgpIDogYSAtIGI7XG4gICAgICAgIH0oKTtcbiAgICB9KCk7XG59XG5jb25zb2xlLmxvZyhcIm5lc3RlZCBibG9jayByZXR1cm4gKHBvc2l0aXZlKTogXCIsIG5lc3RlZF9ibG9ja19yZXR1cm4oNSkpO1xuY29uc29sZS5sb2coXCJuZXN0ZWQgYmxvY2sgcmV0dXJuIChuZWdhdGl2ZSk6IFwiLCBuZXN0ZWRfYmxvY2tfcmV0dXJuKC01KSk7XG5mdW5jdGlvbiByZXR1cm5fY29tcGxleCgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiBcIkpvaG5cIixcbiAgICAgICAgYWdlOiAzMCxcbiAgICAgICAgc2NvcmVzOiBbODUsIDkwLCA5NV1cbiAgICB9O1xufVxuY29uc29sZS5sb2coXCJyZXR1cm4gY29tcGxleDogXCIsIHJldHVybl9jb21wbGV4KCkpO1xuZnVuY3Rpb24gc2VxdWVudGlhbF9yZXR1cm5zKHgpIHtcbiAgICByZXR1cm4geCArIDE7XG59XG5jb25zb2xlLmxvZyhcInNlcXVlbnRpYWwgcmV0dXJuczogXCIsIHNlcXVlbnRpYWxfcmV0dXJucygxMCkpO1xuZnVuY3Rpb24gc2VxdWVudGlhbF9yZXR1cm5zMih4KSB7XG4gICAgeCArIDE7XG4gICAgcmV0dXJuIHggKyAyO1xufVxuY29uc29sZS5sb2coXCJzZXF1ZW50aWFsIHJldHVybnM6IFwiLCBzZXF1ZW50aWFsX3JldHVybnMyKDEwKSk7XG5mdW5jdGlvbiBzZXF1ZW50aWFsX3JldHVybnMzKHgpIHtcbiAgICB4ICsgMTtcbiAgICB4ICsgMjtcbiAgICByZXR1cm4geCArIDM7XG59XG5jb25zb2xlLmxvZyhcInNlcXVlbnRpYWwgcmV0dXJuczogXCIsIHNlcXVlbnRpYWxfcmV0dXJuczMoMTApKTtcbmZ1bmN0aW9uIGRlZXBfY29uZGl0aW9uYWxfcmV0dXJuKHgpIHtcbiAgICByZXR1cm4geCA+IDEwID8geCA+IDIwID8geCA+IDMwID8gXCJ2ZXJ5IGxhcmdlXCIgOiBcImxhcmdlXCIgOiBcIm1lZGl1bVwiIDogXCJzbWFsbFwiO1xufVxuY29uc29sZS5sb2coXCJkZWVwIGNvbmRpdGlvbmFsICg0MCk6IFwiLCBkZWVwX2NvbmRpdGlvbmFsX3JldHVybig0MCkpO1xuY29uc29sZS5sb2coXCJkZWVwIGNvbmRpdGlvbmFsICgyNSk6IFwiLCBkZWVwX2NvbmRpdGlvbmFsX3JldHVybigyNSkpO1xuY29uc29sZS5sb2coXCJkZWVwIGNvbmRpdGlvbmFsICgxNSk6IFwiLCBkZWVwX2NvbmRpdGlvbmFsX3JldHVybigxNSkpO1xuY29uc29sZS5sb2coXCJkZWVwIGNvbmRpdGlvbmFsICg1KTogXCIsIGRlZXBfY29uZGl0aW9uYWxfcmV0dXJuKDUpKTtcbmNvbnNvbGUubG9nKFwiXFxcXG4jIyBSZXR1cm4gaW4gRnVuY3Rpb24gQXJndW1lbnRzICMjXFxcXG5cIik7XG5mdW5jdGlvbiBhZGRfb25lKHgpIHtcbiAgICByZXR1cm4geCArIDE7XG59XG5mdW5jdGlvbiByZXR1cm5fYXNfYXJnKGNvbmRpdGlvbikge1xuICAgIHJldHVybiBhZGRfb25lKGNvbmRpdGlvbiA/IDEwIDogKCgpID0+IDApKCkpO1xufVxuY29uc29sZS5sb2coXCJyZXR1cm4gYXMgYXJndW1lbnQgKHRydWUpOiBcIiwgcmV0dXJuX2FzX2FyZyh0cnVlKSk7XG5jb25zb2xlLmxvZyhcInJldHVybiBhcyBhcmd1bWVudCAoZmFsc2UpOiBcIiwgcmV0dXJuX2FzX2FyZyhmYWxzZSkpO1xuY29uc29sZS5sb2coXCJcXFxcbiMjIEZ1bmN0aW9uIENvbXBvc2l0aW9uIHdpdGggUmV0dXJuICMjXFxcXG5cIik7XG5mdW5jdGlvbiBvdXRlcih4KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gbWlkZGxlKHgpO1xuICAgICAgICByZXN1bHQgKyAxMDAwO1xuICAgICAgICByZXR1cm4gcmVzdWx0ICsgMTAwMDtcbiAgICB9KCk7XG59XG5mdW5jdGlvbiBtaWRkbGUoeCkge1xuICAgIHJldHVybiB4IDwgMCA/ICgoKSA9PiAtMSkoKSA6IGlubmVyKHgpO1xufVxuZnVuY3Rpb24gaW5uZXIoeCkge1xuICAgIHJldHVybiB4IDwgMTAgPyAoKCkgPT4gMCkoKSA6IHggKiAxMDtcbn1cbmNvbnNvbGUubG9nKFwiZnVuY3Rpb24gY2hhaW4gKG5lZ2F0aXZlKTogXCIsIG91dGVyKC01KSk7XG5jb25zb2xlLmxvZyhcImZ1bmN0aW9uIGNoYWluIChzbWFsbCk6IFwiLCBvdXRlcig1KSk7XG5jb25zb2xlLmxvZyhcImZ1bmN0aW9uIGNoYWluIChsYXJnZSk6IFwiLCBvdXRlcigxNSkpO1xuY29uc29sZS5sb2coXCJcXFxcbj09PSBSZXR1cm4gVGVzdHMgQ29tcGxldGUgPT09XFxcXG5cIik7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsUUFBUSxJQUFJLDhDQUE4QztBQUMxRCxRQUFRLElBQUksc0NBQXNDO0FBQ2xELFNBQVMsc0JBQXNCLE1BQU07QUFDakMsTUFBSSxJQUFJO0FBQ1IsTUFBSSxLQUFLLFdBQVcsS0FBSyxPQUFPLEtBQUssQ0FBQyxNQUFNLFlBQVksS0FBSyxDQUFDLE1BQU0sUUFBUSxDQUFDLE1BQU0sUUFBUSxLQUFLLENBQUMsQ0FBQyxHQUFHO0FBQ2pHLFFBQUksS0FBSyxDQUFDLEVBQUUsR0FBRyxNQUFNO0FBQ2pCLFVBQUksS0FBSyxDQUFDLEVBQUUsR0FBRztBQUNuQixRQUFJLE1BQU0sVUFBYSxLQUFLLFNBQVM7QUFDakMsVUFBSSxLQUFLLENBQUM7QUFBQSxFQUNsQixPQUNLO0FBQ0QsUUFBSSxLQUFLLFNBQVM7QUFDZCxVQUFJLEtBQUssQ0FBQztBQUFBLEVBQ2xCO0FBQ0EsTUFBSSxPQUFPLE1BQU0sWUFBWSxNQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssVUFBVSxDQUFDLENBQUMsSUFBSTtBQUMxRSxNQUFJLE9BQU8sTUFBTyxZQUFZLE1BQU0sT0FBTyxLQUFLLE1BQU0sS0FBSyxVQUFVLENBQUMsQ0FBQyxJQUFJO0FBQzNFLFNBQU8sV0FBWTtBQUNmLFVBQU0sVUFBVSxJQUFJO0FBQ3BCO0FBQ0EsV0FBTztBQUFBLEVBQ1gsRUFBRTtBQUNOO0FBQ0EsUUFBUSxJQUFJLHdCQUF3QixtQkFBbUIsQ0FBQyxDQUFDO0FBQ3pELFNBQVMsc0JBQXNCLE1BQU07QUFDakMsTUFBSSxJQUFJO0FBQ1IsTUFBSSxLQUFLLFdBQVcsS0FBSyxPQUFPLEtBQUssQ0FBQyxNQUFNLFlBQVksS0FBSyxDQUFDLE1BQU0sUUFBUSxDQUFDLE1BQU0sUUFBUSxLQUFLLENBQUMsQ0FBQyxHQUFHO0FBQ2pHLFFBQUksS0FBSyxDQUFDLEVBQUUsR0FBRyxNQUFNO0FBQ2pCLFVBQUksS0FBSyxDQUFDLEVBQUUsR0FBRztBQUNuQixRQUFJLE1BQU0sVUFBYSxLQUFLLFNBQVM7QUFDakMsVUFBSSxLQUFLLENBQUM7QUFBQSxFQUNsQixPQUNLO0FBQ0QsUUFBSSxLQUFLLFNBQVM7QUFDZCxVQUFJLEtBQUssQ0FBQztBQUFBLEVBQ2xCO0FBQ0EsTUFBSSxPQUFPLE1BQU0sWUFBWSxNQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssVUFBVSxDQUFDLENBQUMsSUFBSTtBQUMxRSxNQUFJLE9BQU8sTUFBTyxZQUFZLE1BQU0sT0FBTyxLQUFLLE1BQU0sS0FBSyxVQUFVLENBQUMsQ0FBQyxJQUFJO0FBQzNFLFNBQU8sV0FBWTtBQUNmLFVBQU0sVUFBVSxJQUFJO0FBQ3BCLFdBQU87QUFBQSxFQUNYLEVBQUU7QUFDTjtBQUNBLFFBQVEsSUFBSSx3QkFBd0IsbUJBQW1CLENBQUMsQ0FBQztBQUN6RCxTQUFTLG1CQUFtQixNQUFNO0FBQzlCLE1BQUksSUFBSTtBQUNSLE1BQUksS0FBSyxXQUFXLEtBQUssT0FBTyxLQUFLLENBQUMsTUFBTSxZQUFZLEtBQUssQ0FBQyxNQUFNLFFBQVEsQ0FBQyxNQUFNLFFBQVEsS0FBSyxDQUFDLENBQUMsR0FBRztBQUNqRyxRQUFJLEtBQUssQ0FBQyxFQUFFLEdBQUcsTUFBTTtBQUNqQixVQUFJLEtBQUssQ0FBQyxFQUFFLEdBQUc7QUFDbkIsUUFBSSxNQUFNLFVBQWEsS0FBSyxTQUFTO0FBQ2pDLFVBQUksS0FBSyxDQUFDO0FBQUEsRUFDbEIsT0FDSztBQUNELFFBQUksS0FBSyxTQUFTO0FBQ2QsVUFBSSxLQUFLLENBQUM7QUFBQSxFQUNsQjtBQUNBLE1BQUksT0FBTyxNQUFNLFlBQVksTUFBTSxPQUFPLEtBQUssTUFBTSxLQUFLLFVBQVUsQ0FBQyxDQUFDLElBQUk7QUFDMUUsTUFBSSxPQUFPLE1BQU8sWUFBWSxNQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssVUFBVSxDQUFDLENBQUMsSUFBSTtBQUMzRSxTQUFPLElBQUksS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJO0FBQ3JDO0FBQ0EsUUFBUSxJQUFJLGdDQUFnQyxnQkFBZ0IsRUFBRSxDQUFDO0FBQy9ELFFBQVEsSUFBSSxtQ0FBbUMsZ0JBQWdCLENBQUMsQ0FBQztBQUNqRSxTQUFTLG1CQUFtQixNQUFNO0FBQzlCLE1BQUksSUFBSTtBQUNSLE1BQUksS0FBSyxXQUFXLEtBQUssT0FBTyxLQUFLLENBQUMsTUFBTSxZQUFZLEtBQUssQ0FBQyxNQUFNLFFBQVEsQ0FBQyxNQUFNLFFBQVEsS0FBSyxDQUFDLENBQUMsR0FBRztBQUNqRyxRQUFJLEtBQUssQ0FBQyxFQUFFLEdBQUcsTUFBTTtBQUNqQixVQUFJLEtBQUssQ0FBQyxFQUFFLEdBQUc7QUFDbkIsUUFBSSxNQUFNLFVBQWEsS0FBSyxTQUFTO0FBQ2pDLFVBQUksS0FBSyxDQUFDO0FBQUEsRUFDbEIsT0FDSztBQUNELFFBQUksS0FBSyxTQUFTO0FBQ2QsVUFBSSxLQUFLLENBQUM7QUFBQSxFQUNsQjtBQUNBLE1BQUksT0FBTyxNQUFNLFlBQVksTUFBTSxPQUFPLEtBQUssTUFBTSxLQUFLLFVBQVUsQ0FBQyxDQUFDLElBQUk7QUFDMUUsTUFBSSxPQUFPLE1BQU8sWUFBWSxNQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssVUFBVSxDQUFDLENBQUMsSUFBSTtBQUMzRSxTQUFPLElBQUksS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLE1BQU0sTUFBTSxLQUFLLEtBQUssTUFBTSxHQUFHO0FBQ3BFO0FBQ0EsUUFBUSxJQUFJLGdDQUFnQyxnQkFBZ0IsRUFBRSxDQUFDO0FBQy9ELFFBQVEsSUFBSSw2QkFBNkIsZ0JBQWdCLEVBQUUsQ0FBQztBQUM1RCxRQUFRLElBQUksOEJBQThCLGdCQUFnQixDQUFDLENBQUM7QUFDNUQsU0FBUyxtQkFBbUIsTUFBTTtBQUM5QixNQUFJLElBQUk7QUFDUixNQUFJLEtBQUssV0FBVyxLQUFLLE9BQU8sS0FBSyxDQUFDLE1BQU0sWUFBWSxLQUFLLENBQUMsTUFBTSxRQUFRLENBQUMsTUFBTSxRQUFRLEtBQUssQ0FBQyxDQUFDLEdBQUc7QUFDakcsUUFBSSxLQUFLLENBQUMsRUFBRSxHQUFHLE1BQU07QUFDakIsVUFBSSxLQUFLLENBQUMsRUFBRSxHQUFHO0FBQ25CLFFBQUksTUFBTSxVQUFhLEtBQUssU0FBUztBQUNqQyxVQUFJLEtBQUssQ0FBQztBQUFBLEVBQ2xCLE9BQ0s7QUFDRCxRQUFJLEtBQUssU0FBUztBQUNkLFVBQUksS0FBSyxDQUFDO0FBQUEsRUFDbEI7QUFDQSxNQUFJLE9BQU8sTUFBTSxZQUFZLE1BQU0sT0FBTyxLQUFLLE1BQU0sS0FBSyxVQUFVLENBQUMsQ0FBQyxJQUFJO0FBQzFFLE1BQUksT0FBTyxNQUFPLFlBQVksTUFBTSxPQUFPLEtBQUssTUFBTSxLQUFLLFVBQVUsQ0FBQyxDQUFDLElBQUk7QUFDM0UsU0FBTyxJQUFJLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSTtBQUNyQztBQUNBLFFBQVEsSUFBSSxnQ0FBZ0MsZ0JBQWdCLEVBQUUsQ0FBQztBQUMvRCxRQUFRLElBQUksZ0NBQWdDLGdCQUFnQixDQUFDLENBQUM7QUFDOUQsUUFBUSxJQUFJLHNDQUFzQztBQUNsRCxTQUFTLG1CQUFtQixHQUFHO0FBQzNCLFNBQU8sV0FBWTtBQUNmLFVBQU0sVUFBVSxJQUFJO0FBQ3BCO0FBQ0EsV0FBTztBQUFBLEVBQ1gsRUFBRTtBQUNOO0FBQ0EsUUFBUSxJQUFJLHdCQUF3QixtQkFBbUIsQ0FBQyxDQUFDO0FBQ3pELFNBQVMsbUJBQW1CLEdBQUc7QUFDM0IsU0FBTyxXQUFZO0FBQ2YsVUFBTSxVQUFVLElBQUk7QUFDcEIsV0FBTztBQUFBLEVBQ1gsRUFBRTtBQUNOO0FBQ0EsUUFBUSxJQUFJLHdCQUF3QixtQkFBbUIsQ0FBQyxDQUFDO0FBQ3pELFNBQVMsZ0JBQWdCLEdBQUc7QUFDeEIsU0FBTyxJQUFJLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSTtBQUNyQztBQUNBLFFBQVEsSUFBSSxnQ0FBZ0MsZ0JBQWdCLEVBQUUsQ0FBQztBQUMvRCxRQUFRLElBQUksbUNBQW1DLGdCQUFnQixDQUFDLENBQUM7QUFDakUsU0FBUyxnQkFBZ0IsR0FBRztBQUN4QixTQUFPLElBQUksS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLE1BQU0sTUFBTSxLQUFLLEtBQUssTUFBTSxHQUFHO0FBQ3BFO0FBQ0EsUUFBUSxJQUFJLGdDQUFnQyxnQkFBZ0IsRUFBRSxDQUFDO0FBQy9ELFFBQVEsSUFBSSw2QkFBNkIsZ0JBQWdCLEVBQUUsQ0FBQztBQUM1RCxRQUFRLElBQUksOEJBQThCLGdCQUFnQixDQUFDLENBQUM7QUFDNUQsU0FBUyxnQkFBZ0IsR0FBRztBQUN4QixTQUFPLElBQUksS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJO0FBQ3JDO0FBQ0EsUUFBUSxJQUFJLGdDQUFnQyxnQkFBZ0IsRUFBRSxDQUFDO0FBQy9ELFFBQVEsSUFBSSxnQ0FBZ0MsZ0JBQWdCLENBQUMsQ0FBQztBQUM5RCxRQUFRLElBQUksaUNBQWlDO0FBQUEsQ0FDNUMsV0FBWTtBQUNULFFBQU0sa0JBQWtCLFNBQVUsR0FBRztBQUNqQyxXQUFPLElBQUk7QUFBQSxFQUNmO0FBQ0EsVUFBUSxJQUFJLDZCQUE2QixNQUFNO0FBQzNDLFFBQUk7QUFDQSxZQUFNLFNBQVMsZ0JBQWdCLENBQUM7QUFDaEMsYUFBTyxXQUFXLFNBQVksU0FBUyxnQkFBZ0IsQ0FBQztBQUFBLElBQzVELFNBQ08sR0FBUDtBQUNJLGFBQU8sZ0JBQWdCLENBQUM7QUFBQSxJQUM1QjtBQUFBLEVBQ0osR0FBRyxDQUFDO0FBQ0osU0FBTyxRQUFRLElBQUksNkJBQTZCLE1BQU07QUFDbEQsUUFBSTtBQUNBLFlBQU0sU0FBUyxnQkFBZ0IsQ0FBQztBQUNoQyxhQUFPLFdBQVcsU0FBWSxTQUFTLGdCQUFnQixDQUFDO0FBQUEsSUFDNUQsU0FDTyxHQUFQO0FBQ0ksYUFBTyxnQkFBZ0IsQ0FBQztBQUFBLElBQzVCO0FBQUEsRUFDSixHQUFHLENBQUM7QUFDUixHQUFHO0FBQUEsQ0FDRixXQUFZO0FBQ1QsUUFBTSxrQkFBa0IsU0FBVSxHQUFHO0FBQ2pDLFdBQU8sSUFBSTtBQUFBLEVBQ2Y7QUFDQSxVQUFRLElBQUksNkJBQTZCLE1BQU07QUFDM0MsUUFBSTtBQUNBLFlBQU0sU0FBUyxnQkFBZ0IsQ0FBQztBQUNoQyxhQUFPLFdBQVcsU0FBWSxTQUFTLGdCQUFnQixDQUFDO0FBQUEsSUFDNUQsU0FDTyxHQUFQO0FBQ0ksYUFBTyxnQkFBZ0IsQ0FBQztBQUFBLElBQzVCO0FBQUEsRUFDSixHQUFHLENBQUM7QUFDSixTQUFPLFFBQVEsSUFBSSw2QkFBNkIsTUFBTTtBQUNsRCxRQUFJO0FBQ0EsWUFBTSxTQUFTLGdCQUFnQixDQUFDO0FBQ2hDLGFBQU8sV0FBVyxTQUFZLFNBQVMsZ0JBQWdCLENBQUM7QUFBQSxJQUM1RCxTQUNPLEdBQVA7QUFDSSxhQUFPLGdCQUFnQixDQUFDO0FBQUEsSUFDNUI7QUFBQSxFQUNKLEdBQUcsQ0FBQztBQUNSLEdBQUc7QUFBQSxDQUNGLFdBQVk7QUFDVCxRQUFNLGVBQWUsU0FBVSxHQUFHO0FBQzlCLFdBQU8sSUFBSSxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUk7QUFBQSxFQUNyQztBQUNBLFVBQVEsSUFBSSxxQ0FBcUMsTUFBTTtBQUNuRCxRQUFJO0FBQ0EsWUFBTSxTQUFTLGFBQWEsRUFBRTtBQUM5QixhQUFPLFdBQVcsU0FBWSxTQUFTLGFBQWEsRUFBRTtBQUFBLElBQzFELFNBQ08sR0FBUDtBQUNJLGFBQU8sYUFBYSxFQUFFO0FBQUEsSUFDMUI7QUFBQSxFQUNKLEdBQUcsQ0FBQztBQUNKLFVBQVEsSUFBSSx3Q0FBd0MsTUFBTTtBQUN0RCxRQUFJO0FBQ0EsWUFBTSxTQUFTLGFBQWEsQ0FBQztBQUM3QixhQUFPLFdBQVcsU0FBWSxTQUFTLGFBQWEsQ0FBQztBQUFBLElBQ3pELFNBQ08sR0FBUDtBQUNJLGFBQU8sYUFBYSxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNKLEdBQUcsQ0FBQztBQUNKLFNBQU8sUUFBUSxJQUFJLHdDQUF3QyxNQUFNO0FBQzdELFFBQUk7QUFDQSxZQUFNLFNBQVMsYUFBYSxDQUFDO0FBQzdCLGFBQU8sV0FBVyxTQUFZLFNBQVMsYUFBYSxDQUFDO0FBQUEsSUFDekQsU0FDTyxHQUFQO0FBQ0ksYUFBTyxhQUFhLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0osR0FBRyxDQUFDO0FBQ1IsR0FBRztBQUFBLENBQ0YsV0FBWTtBQUNULFFBQU0sZUFBZSxTQUFVLEdBQUc7QUFDOUIsV0FBTyxXQUFZO0FBQ2YsWUFBTSxJQUFJLElBQUk7QUFDZCxPQUFDLFdBQVk7QUFDVCxjQUFNLElBQUksSUFBSTtBQUNkO0FBQ0EsZUFBTztBQUFBLE1BQ1gsR0FBRztBQUNILGFBQU8sV0FBWTtBQUNmLGNBQU0sSUFBSSxJQUFJO0FBQ2Q7QUFDQSxlQUFPO0FBQUEsTUFDWCxFQUFFO0FBQUEsSUFDTixFQUFFO0FBQUEsRUFDTjtBQUNBLFVBQVEsSUFBSSw2QkFBNkIsTUFBTTtBQUMzQyxRQUFJO0FBQ0EsWUFBTSxTQUFTLGFBQWEsQ0FBQztBQUM3QixhQUFPLFdBQVcsU0FBWSxTQUFTLGFBQWEsQ0FBQztBQUFBLElBQ3pELFNBQ08sR0FBUDtBQUNJLGFBQU8sYUFBYSxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNKLEdBQUcsQ0FBQztBQUNKLFNBQU8sUUFBUSxJQUFJLDZCQUE2QixNQUFNO0FBQ2xELFFBQUk7QUFDQSxZQUFNLFNBQVMsYUFBYSxDQUFDO0FBQzdCLGFBQU8sV0FBVyxTQUFZLFNBQVMsYUFBYSxDQUFDO0FBQUEsSUFDekQsU0FDTyxHQUFQO0FBQ0ksYUFBTyxhQUFhLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0osR0FBRyxDQUFDO0FBQ1IsR0FBRztBQUFBLENBQ0YsV0FBWTtBQUNULFFBQU0sd0JBQXdCLFNBQVUsR0FBRztBQUN2QyxXQUFPLFdBQVk7QUFDZixZQUFNLElBQUksSUFBSTtBQUNkLE9BQUMsV0FBWTtBQUNULGNBQU0sSUFBSSxJQUFJO0FBQ2QsZUFBTztBQUFBLE1BQ1gsR0FBRztBQUNILGFBQU8sV0FBWTtBQUNmLGNBQU0sSUFBSSxJQUFJO0FBQ2QsZUFBTztBQUFBLE1BQ1gsRUFBRTtBQUFBLElBQ04sRUFBRTtBQUFBLEVBQ047QUFDQSxVQUFRLElBQUksc0NBQXNDLE1BQU07QUFDcEQsUUFBSTtBQUNBLFlBQU0sU0FBUyxzQkFBc0IsQ0FBQztBQUN0QyxhQUFPLFdBQVcsU0FBWSxTQUFTLHNCQUFzQixDQUFDO0FBQUEsSUFDbEUsU0FDTyxHQUFQO0FBQ0ksYUFBTyxzQkFBc0IsQ0FBQztBQUFBLElBQ2xDO0FBQUEsRUFDSixHQUFHLENBQUM7QUFDSixTQUFPLFFBQVEsSUFBSSxzQ0FBc0MsTUFBTTtBQUMzRCxRQUFJO0FBQ0EsWUFBTSxTQUFTLHNCQUFzQixDQUFDO0FBQ3RDLGFBQU8sV0FBVyxTQUFZLFNBQVMsc0JBQXNCLENBQUM7QUFBQSxJQUNsRSxTQUNPLEdBQVA7QUFDSSxhQUFPLHNCQUFzQixDQUFDO0FBQUEsSUFDbEM7QUFBQSxFQUNKLEdBQUcsQ0FBQztBQUNSLEdBQUc7QUFDSCxRQUFRLElBQUksMENBQTBDO0FBQ3RELFNBQVMsaUJBQWlCLEdBQUc7QUFDekIsU0FBTyxXQUFZO0FBQ2YsVUFBTSxlQUFlLFNBQVUsR0FBRztBQUM5QixhQUFPLElBQUksS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJO0FBQUEsSUFDckM7QUFDQSxpQkFBYSxDQUFDO0FBQ2QsV0FBTyxhQUFhLENBQUM7QUFBQSxFQUN6QixFQUFFO0FBQ047QUFDQSxRQUFRLElBQUksaUNBQWlDLGlCQUFpQixFQUFFLENBQUM7QUFDakUsUUFBUSxJQUFJLGlDQUFpQyxpQkFBaUIsQ0FBQyxDQUFDO0FBQ2hFLFNBQVMsb0JBQW9CLE1BQU07QUFDL0IsTUFBSSxJQUFJO0FBQ1IsTUFBSSxLQUFLLFdBQVcsS0FBSyxPQUFPLEtBQUssQ0FBQyxNQUFNLFlBQVksS0FBSyxDQUFDLE1BQU0sUUFBUSxDQUFDLE1BQU0sUUFBUSxLQUFLLENBQUMsQ0FBQyxHQUFHO0FBQ2pHLFFBQUksS0FBSyxDQUFDLEVBQUUsR0FBRyxNQUFNO0FBQ2pCLFVBQUksS0FBSyxDQUFDLEVBQUUsR0FBRztBQUNuQixRQUFJLE1BQU0sVUFBYSxLQUFLLFNBQVM7QUFDakMsVUFBSSxLQUFLLENBQUM7QUFBQSxFQUNsQixPQUNLO0FBQ0QsUUFBSSxLQUFLLFNBQVM7QUFDZCxVQUFJLEtBQUssQ0FBQztBQUFBLEVBQ2xCO0FBQ0EsTUFBSSxPQUFPLE1BQU0sWUFBWSxNQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssVUFBVSxDQUFDLENBQUMsSUFBSTtBQUMxRSxNQUFJLE9BQU8sTUFBTyxZQUFZLE1BQU0sT0FBTyxLQUFLLE1BQU0sS0FBSyxVQUFVLENBQUMsQ0FBQyxJQUFJO0FBQzNFLFNBQU8sV0FBWTtBQUNmLFVBQU0sZUFBZSxTQUFVLEdBQUc7QUFDOUIsYUFBTyxJQUFJLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSTtBQUFBLElBQ3JDO0FBQ0EsV0FBTyxhQUFhLENBQUM7QUFBQSxFQUN6QixFQUFFO0FBQ047QUFDQSxRQUFRLElBQUksaUNBQWlDLGlCQUFpQixFQUFFLENBQUM7QUFDakUsUUFBUSxJQUFJLGlDQUFpQyxpQkFBaUIsQ0FBQyxDQUFDO0FBQ2hFLFNBQVMsZUFBZSxXQUFXO0FBQy9CLFNBQU8sV0FBWTtBQUNmLFVBQU0sV0FBVyxTQUFVLEdBQUc7QUFDMUIsYUFBTyxJQUFJLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSTtBQUFBLElBQ3RDO0FBQ0EsaUJBQWEsTUFBTTtBQUNmLFVBQUk7QUFDQSxjQUFNLFNBQVMsU0FBUyxDQUFDO0FBQ3pCLGVBQU8sV0FBVyxTQUFZLFNBQVMsU0FBUyxDQUFDO0FBQUEsTUFDckQsU0FDTyxHQUFQO0FBQ0ksZUFBTyxTQUFTLENBQUM7QUFBQSxNQUNyQjtBQUFBLElBQ0osR0FBRyxLQUFLLE1BQU0sTUFBTTtBQUNwQixXQUFPLGFBQWEsTUFBTTtBQUN0QixVQUFJO0FBQ0EsY0FBTSxTQUFTLFNBQVMsQ0FBQztBQUN6QixlQUFPLFdBQVcsU0FBWSxTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQ3JELFNBQ08sR0FBUDtBQUNJLGVBQU8sU0FBUyxDQUFDO0FBQUEsTUFDckI7QUFBQSxJQUNKLEdBQUcsS0FBSyxNQUFNLE1BQU07QUFBQSxFQUN4QixFQUFFO0FBQ047QUFDQSxRQUFRLElBQUksMkJBQTJCLGVBQWUsSUFBSSxDQUFDO0FBQzNELFFBQVEsSUFBSSw0QkFBNEIsZUFBZSxLQUFLLENBQUM7QUFDN0QsUUFBUSxJQUFJLCtCQUErQjtBQUMzQyxTQUFTLG9CQUFvQjtBQUN6QixTQUFPO0FBQ1g7QUFDQSxRQUFRLElBQUksNEJBQTRCLGtCQUFrQixDQUFDO0FBQzNELFNBQVMsb0JBQW9CLEdBQUc7QUFDNUIsU0FBTyxXQUFZO0FBQ2YsVUFBTSxJQUFJO0FBQ1YsS0FBQyxXQUFZO0FBQ1QsWUFBTSxJQUFJO0FBQ1YsVUFBSSxLQUFLLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSTtBQUM5QixhQUFPLElBQUksS0FBSyxNQUFNLElBQUksR0FBRyxJQUFJLElBQUk7QUFBQSxJQUN6QyxHQUFHO0FBQ0gsV0FBTyxXQUFZO0FBQ2YsWUFBTSxJQUFJO0FBQ1YsVUFBSSxLQUFLLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSTtBQUM5QixhQUFPLElBQUksS0FBSyxNQUFNLElBQUksR0FBRyxJQUFJLElBQUk7QUFBQSxJQUN6QyxFQUFFO0FBQUEsRUFDTixFQUFFO0FBQ047QUFDQSxRQUFRLElBQUksb0NBQW9DLG9CQUFvQixDQUFDLENBQUM7QUFDdEUsUUFBUSxJQUFJLG9DQUFvQyxvQkFBb0IsRUFBRSxDQUFDO0FBQ3ZFLFNBQVMsaUJBQWlCO0FBQ3RCLFNBQU87QUFBQSxJQUNILE1BQU07QUFBQSxJQUNOLEtBQUs7QUFBQSxJQUNMLFFBQVEsQ0FBQyxJQUFJLElBQUksRUFBRTtBQUFBLEVBQ3ZCO0FBQ0o7QUFDQSxRQUFRLElBQUksb0JBQW9CLGVBQWUsQ0FBQztBQUNoRCxTQUFTLG1CQUFtQixHQUFHO0FBQzNCLFNBQU8sSUFBSTtBQUNmO0FBQ0EsUUFBUSxJQUFJLHdCQUF3QixtQkFBbUIsRUFBRSxDQUFDO0FBQzFELFNBQVMsb0JBQW9CLEdBQUc7QUFDNUIsTUFBSTtBQUNKLFNBQU8sSUFBSTtBQUNmO0FBQ0EsUUFBUSxJQUFJLHdCQUF3QixvQkFBb0IsRUFBRSxDQUFDO0FBQzNELFNBQVMsb0JBQW9CLEdBQUc7QUFDNUIsTUFBSTtBQUNKLE1BQUk7QUFDSixTQUFPLElBQUk7QUFDZjtBQUNBLFFBQVEsSUFBSSx3QkFBd0Isb0JBQW9CLEVBQUUsQ0FBQztBQUMzRCxTQUFTLHdCQUF3QixHQUFHO0FBQ2hDLFNBQU8sSUFBSSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssZUFBZSxVQUFVLFdBQVc7QUFDMUU7QUFDQSxRQUFRLElBQUksMkJBQTJCLHdCQUF3QixFQUFFLENBQUM7QUFDbEUsUUFBUSxJQUFJLDJCQUEyQix3QkFBd0IsRUFBRSxDQUFDO0FBQ2xFLFFBQVEsSUFBSSwyQkFBMkIsd0JBQXdCLEVBQUUsQ0FBQztBQUNsRSxRQUFRLElBQUksMEJBQTBCLHdCQUF3QixDQUFDLENBQUM7QUFDaEUsUUFBUSxJQUFJLDBDQUEwQztBQUN0RCxTQUFTLFFBQVEsR0FBRztBQUNoQixTQUFPLElBQUk7QUFDZjtBQUNBLFNBQVMsY0FBYyxXQUFXO0FBQzlCLFNBQU8sUUFBUSxZQUFZLE1BQU0sTUFBTSxHQUFHLENBQUM7QUFDL0M7QUFDQSxRQUFRLElBQUksK0JBQStCLGNBQWMsSUFBSSxDQUFDO0FBQzlELFFBQVEsSUFBSSxnQ0FBZ0MsY0FBYyxLQUFLLENBQUM7QUFDaEUsUUFBUSxJQUFJLDhDQUE4QztBQUMxRCxTQUFTLE1BQU0sR0FBRztBQUNkLFNBQU8sV0FBWTtBQUNmLFVBQU0sU0FBUyxPQUFPLENBQUM7QUFDdkIsYUFBUztBQUNULFdBQU8sU0FBUztBQUFBLEVBQ3BCLEVBQUU7QUFDTjtBQUNBLFNBQVMsT0FBTyxHQUFHO0FBQ2YsU0FBTyxJQUFJLEtBQUssTUFBTSxJQUFJLElBQUksTUFBTSxDQUFDO0FBQ3pDO0FBQ0EsU0FBUyxNQUFNLEdBQUc7QUFDZCxTQUFPLElBQUksTUFBTSxNQUFNLEdBQUcsSUFBSSxJQUFJO0FBQ3RDO0FBQ0EsUUFBUSxJQUFJLCtCQUErQixNQUFNLEVBQUUsQ0FBQztBQUNwRCxRQUFRLElBQUksNEJBQTRCLE1BQU0sQ0FBQyxDQUFDO0FBQ2hELFFBQVEsSUFBSSw0QkFBNEIsTUFBTSxFQUFFLENBQUM7QUFDakQsUUFBUSxJQUFJLHFDQUFxQzsiLAogICJuYW1lcyI6IFtdCn0K
