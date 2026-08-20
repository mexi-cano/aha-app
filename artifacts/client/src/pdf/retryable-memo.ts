export function createRetryableMemoizedLoader<T>(
  load: () => Promise<T>,
): () => Promise<T> {
  let cached: Promise<T> | null = null;

  return () => {
    if (cached) return cached;
    const pending = Promise.resolve()
      .then(load)
      .catch((cause: unknown) => {
        if (cached === pending) cached = null;
        throw cause;
      });
    cached = pending;
    return pending;
  };
}
