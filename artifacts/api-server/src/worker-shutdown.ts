export type ShutdownResource = () => Promise<void> | void;

export type WorkerShutdownDependencies = {
  pauseNewJobs: ShutdownResource;
  waitForActiveJobs: (timeoutMs: number) => Promise<boolean>;
  abortActiveJobs?: ShutdownResource;
  closeGracefully: ShutdownResource;
  closeForcefully: ShutdownResource;
  closeRedis: ShutdownResource;
  closeOutbox: ShutdownResource;
  closeDatabase: ShutdownResource;
  activeJobsRemaining?: () => number;
};

export type WorkerShutdownResult = {
  timedOut: boolean;
  mode: "graceful" | "force";
  workerClosed: boolean;
  resourcesClosed: boolean;
  errors: string[];
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : "shutdown resource failed";
}

type BoundedResult<T> = { completed: boolean; succeeded: boolean; value?: T };

async function runBounded<T>(resource: () => Promise<T> | T, timeoutMs: number, errors: string[]): Promise<BoundedResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let operation: Promise<T>;
  try {
    operation = Promise.resolve().then(resource);
    const timeout = new Promise<{ completed: false }>((resolve) => {
      timer = setTimeout(() => resolve({ completed: false }), timeoutMs);
      timer.unref?.();
    });
    const result = await Promise.race([
      operation.then((value) => ({ completed: true as const, succeeded: true, value })).catch((error) => {
        errors.push(describeError(error));
        return { completed: true as const, succeeded: false };
      }),
      timeout,
    ]);
    if (!result.completed) void operation.catch((error) => errors.push(describeError(error)));
    return result.completed ? result : { completed: false, succeeded: false };
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
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());

  const paused = await runBounded(dependencies.pauseNewJobs, remaining(), errors);
  let force = !paused.completed || !paused.succeeded;
  if (!force) {
    const drained = await runBounded(() => dependencies.waitForActiveJobs(remaining()), remaining(), errors);
    force = !drained.completed || !drained.succeeded || drained.value !== true;
  }

  if (force && dependencies.abortActiveJobs) {
    const aborted = await runBounded(dependencies.abortActiveJobs, remaining(), errors);
    if (!aborted.completed || !aborted.succeeded) errors.push("active job abort did not complete");
  }

  const close = await runBounded(force ? dependencies.closeForcefully : dependencies.closeGracefully, remaining(), errors);
  const workerClosed = close.completed && close.succeeded;
  if (!workerClosed) {
    return { timedOut: true, mode: force ? "force" : "graceful", workerClosed: false, resourcesClosed: false, errors };
  }
  if (force && dependencies.activeJobsRemaining && dependencies.activeJobsRemaining() > 0) {
    errors.push("active processors remain after force close; external resources left open for lease recovery");
    return { timedOut: true, mode: "force", workerClosed: true, resourcesClosed: false, errors };
  }

  const resources: ShutdownResource[] = [dependencies.closeRedis, dependencies.closeOutbox, dependencies.closeDatabase];
  let resourcesClosed = true;
  for (const resource of resources) {
    const result = await runBounded(resource, remaining(), errors);
    if (!result.completed || !result.succeeded) {
      resourcesClosed = false;
      break;
    }
  }
  return { timedOut: force || !resourcesClosed, mode: force ? "force" : "graceful", workerClosed: true, resourcesClosed, errors };
}

export type ActiveJobTracker = ReturnType<typeof createActiveJobTracker>;

export function createActiveJobTracker() {
  let active = 0;
  const controllers = new Set<AbortController>();
  let drainResolvers: Array<() => void> = [];

  const notifyDrain = () => {
    if (active !== 0) return;
    const resolvers = drainResolvers;
    drainResolvers = [];
    for (const resolve of resolvers) resolve();
  };

  return {
    get activeCount() { return active; },
    track<T>(factory: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const controller = new AbortController();
      active += 1;
      controllers.add(controller);
      return Promise.resolve()
        .then(() => factory(controller.signal))
        .finally(() => {
          active -= 1;
          controllers.delete(controller);
          notifyDrain();
        });
    },
    abortAll(reason = new Error("Worker is shutting down")): void {
      for (const controller of controllers) controller.abort(reason);
    },
    async waitForDrain(timeoutMs: number): Promise<boolean> {
      if (active === 0) return true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          new Promise<true>((resolve) => drainResolvers.push(() => resolve(true))),
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), timeoutMs);
            timer.unref?.();
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
