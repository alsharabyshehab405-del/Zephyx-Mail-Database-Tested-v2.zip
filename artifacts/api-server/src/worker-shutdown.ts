export type ShutdownResource = () => Promise<void> | void;

export type WorkerShutdownDependencies = {
  stopAcceptingJobs: ShutdownResource;
  forceStopJobs: ShutdownResource;
  closeRedis: ShutdownResource;
  closeOutbox: ShutdownResource;
  closeDatabase: ShutdownResource;
};

export type WorkerShutdownResult = {
  timedOut: boolean;
  errors: string[];
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : "shutdown resource failed";
}

async function runBounded(resource: ShutdownResource, timeoutMs: number, errors: string[]): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = Promise.resolve().then(resource);
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref?.();
    });
    const completed = await Promise.race([operation.then(() => true as const).catch((error) => {
      errors.push(describeError(error));
      return true as const;
    }), timeout]);
    if (!completed) void operation.catch((error) => errors.push(describeError(error)));
    return completed;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function gracefulShutdownWorker(
  dependencies: WorkerShutdownDependencies,
  timeoutMs: number,
): Promise<WorkerShutdownResult> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) throw new Error("Worker shutdown timeout must be at least 1000ms");
  const errors: string[] = [];
  const stopped = await runBounded(dependencies.stopAcceptingJobs, timeoutMs, errors);
  if (!stopped) {
    // Force BullMQ to stop waiting for active jobs. Their PostgreSQL lease remains
    // recoverable by the scheduler; this function never marks a job completed.
    void Promise.resolve().then(dependencies.forceStopJobs).catch((error) => errors.push(describeError(error)));
  }

  const remainingResources: ShutdownResource[] = [dependencies.closeRedis, dependencies.closeOutbox, dependencies.closeDatabase];
  for (const resource of remainingResources) await runBounded(resource, timeoutMs, errors);
  return { timedOut: !stopped, errors };
}
