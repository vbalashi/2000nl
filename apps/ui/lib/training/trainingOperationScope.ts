/** A lease spans the entire logical operation, including waits before transport.
 * Transport abortion is best effort; isCurrent remains the commit authority. */
export type TrainingOperation = {
  signal: AbortSignal;
  isCurrent: () => boolean;
};

export function createTrainingOperationScope() {
  let lifetime = new AbortController();
  const channels = new Map<string, AbortController>();
  const cancel = (channel: string) => {
    channels.get(channel)?.abort();
    channels.delete(channel);
  };
  const reset = () => {
    lifetime.abort();
    lifetime = new AbortController();
    for (const channel of channels.keys()) cancel(channel);
  };
  const capture = (channel: string): TrainingOperation => {
    let operation = channels.get(channel);
    if (!operation) { operation = new AbortController(); channels.set(channel, operation); }
    const owned = operation;
    const run = lifetime;
    return {signal:owned.signal,isCurrent:()=>!run.signal.aborted && !owned.signal.aborted && channels.get(channel)===owned};
  };
  const begin = (channel: string) => { cancel(channel); return capture(channel); };
  return {capture,begin,cancel,reset};
}
export type TrainingOperationScope = ReturnType<typeof createTrainingOperationScope>;
