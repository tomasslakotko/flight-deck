const TIMEOUT_MS = 800;

export function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("storage-timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function tryStorage<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await withTimeout(run());
  } catch {
    return undefined;
  }
}
