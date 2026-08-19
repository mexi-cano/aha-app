export function createSerializedPersistence<TInput, TOutput>(
  persist: (value: TInput) => Promise<TOutput>,
): (value: TInput) => Promise<TOutput> {
  let tail: Promise<void> = Promise.resolve();

  return (value) => {
    const operation = tail.then(() => persist(value));
    tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
}
