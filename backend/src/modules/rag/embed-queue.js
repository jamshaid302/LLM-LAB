/**
 * One in-process worker for document embeds. The upload request enqueues and
 * returns; the next turn of the event loop runs the job. A newer job for the
 * same file replaces one that has not started. The caller decides what `run`
 * does, which is embed or drop that file.
 */
export function createEmbedQueue(run) {
  const generations = new Map();
  const jobs = new Map();
  let pending = [];
  let active = null;
  let scheduled = false;

  function present(job) {
    return {
      filename: job.filename,
      status: job.status,
      chunks: job.chunks,
      error: job.error,
    };
  }

  function enqueue(filename) {
    const generation = (generations.get(filename) ?? 0) + 1;
    generations.set(filename, generation);
    pending = pending.filter((job) => {
      if (job.filename !== filename) return true;
      finish(job, null);
      return false;
    });

    let resolve;
    let reject;
    const done = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    done.catch(() => {});

    const job = {
      filename,
      generation,
      status: "queued",
      chunks: null,
      error: null,
      done,
      resolve,
      reject,
      settled: false,
    };
    jobs.set(filename, job);
    pending.push(job);
    schedule();
    return job;
  }

  function finish(job, result, error) {
    if (job.settled) return;
    job.settled = true;
    if (error) job.reject(error);
    else job.resolve(result);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      pump();
    });
  }

  function pump() {
    if (active || pending.length === 0) return;
    const job = pending.shift();
    if (job.generation !== generations.get(job.filename)) {
      finish(job, null);
      pump();
      return;
    }

    active = job;
    job.status = "embedding";
    run(job.filename)
      .then((result) => {
        if (job.generation !== generations.get(job.filename)) {
          finish(job, null);
          return;
        }
        job.status = "ready";
        job.chunks = result.chunks;
        job.error = null;
        finish(job, result);
      })
      .catch((err) => {
        if (job.generation !== generations.get(job.filename)) {
          finish(job, null);
          return;
        }
        job.status = "failed";
        job.error = err?.message || "Embedding failed";
        finish(job, undefined, err);
      })
      .finally(() => {
        active = null;
        pump();
      });
  }

  function forget(filename) {
    const generation = (generations.get(filename) ?? 0) + 1;
    generations.set(filename, generation);
    pending = pending.filter((job) => {
      if (job.filename !== filename) return true;
      finish(job, null);
      return false;
    });
    jobs.delete(filename);
  }

  function get(filename) {
    const job = jobs.get(filename);
    return job ? present(job) : null;
  }

  async function whenIdle() {
    while (active || pending.length > 0 || scheduled) {
      if (active) {
        await active.done.catch(() => {});
        continue;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  return { enqueue, get, forget, whenIdle, present };
}
