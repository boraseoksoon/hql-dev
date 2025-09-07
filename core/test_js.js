console.log("Hello from JavaScript");
const arr = [1, 2, 3, 4, 5];
console.log(arr.map(x => x * 2));

async function test() {
  const response = await fetch("https://api.github.com/rate_limit");
  console.log("GitHub API test:", response.status);
}

test();
