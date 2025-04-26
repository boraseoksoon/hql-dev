export async function prompt(message: string, defaultValue = ""): Promise<string> {
  console.log(message);
  const buf = new Uint8Array(1024);
  await Deno.stdout.write(new TextEncoder().encode(`> `));
  const n = await Deno.stdin.read(buf);
  const input = n 
    ? new TextDecoder().decode(buf.subarray(0, n)).trim() 
    : "";
  
  return input || defaultValue;
}

export function incrementPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) {
    return "0.0.1";
  }
  
  try {
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    let patch = parseInt(parts[2], 10);
    patch++;
    
    return `${major}.${minor}.${patch}`;
  } catch {
    return "0.0.1";
  }
}