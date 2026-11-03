import { fork } from "node:child_process";

const RESOLVE_TYPESCRIPT = new URL("./resolveTypeScript.ts", import.meta.url).href;

/** What a job's process sends back: its result, or why it failed. */
export type JobOutcome<Result> = { readonly result: Result } | { readonly error: string };

/** Runs one job in a process of its own, started from a script that calls {@link serveOneJob}. */
export async function runInProcess<Result>(script: URL, job: object): Promise<Result> {
  const child = fork(script, [], { execArgv: ["--import", RESOLVE_TYPESCRIPT] });
  const outcome = new Promise<JobOutcome<Result>>((resolve, reject) => {
    child.once("message", (message) => {
      resolve(message as JobOutcome<Result>);
    });
    child.once("exit", (code) => {
      reject(new Error(`A job's process stopped (exit code ${String(code)}) before finishing`));
    });
    child.once("error", reject);
  });
  child.send(job);
  const received = await outcome;
  if ("error" in received) throw new Error(received.error);
  return received.result;
}

/**
 * Runs every job, each in its own process, several at once up to the concurrency, and gives their
 * results in the jobs' order. It reports each job as it finishes.
 */
export async function runInProcesses<Result>(
  script: URL,
  jobs: readonly object[],
  concurrency: number,
  onFinished: (result: Result, finished: number) => void = () => undefined,
): Promise<Result[]> {
  const results = new Array<Result>(jobs.length);
  let next = 0;
  let finished = 0;
  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const index = next++;
      const result = await runInProcess<Result>(script, jobs[index] ?? {});
      results[index] = result;
      finished += 1;
      onFinished(result, finished);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  return results;
}

/** In a job's process: takes the one job it is sent, and sends back what the handler made of it. */
export function serveOneJob(handler: (job: never) => unknown): void {
  process.once("message", (job: unknown) => {
    void (async () => {
      let outcome: JobOutcome<unknown>;
      try {
        // The job is whatever the pool sent, which the handler's own script knows the shape of.
        outcome = { result: await handler(job as never) };
      } catch (error) {
        outcome = { error: error instanceof Error ? error.message : String(error) };
      }
      process.send?.(outcome, () => {
        process.disconnect?.();
      });
    })();
  });
}
