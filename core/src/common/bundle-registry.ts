// core/src/common/bundle-registry.ts
let currentBundlePath: string | undefined;

export function setCurrentBundlePath(path: string) {
  currentBundlePath = path;
}

export function getCurrentBundlePath(): string | undefined {
  return currentBundlePath;
}