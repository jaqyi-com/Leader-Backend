// Native CommonJS concurrency limiter (replaces ESM p-limit)
function pLimit(concurrency) {
  const queue = [];
  let active = 0;

  const next = () => {
    active--;
    if (queue.length > 0) {
      queue.shift()();
    }
  };

  const run = async (fn, resolve, reject, args) => {
    active++;
    try {
      resolve(await fn(...args));
    } catch (err) {
      reject(err);
    } finally {
      next();
    }
  };

  const enqueue = (fn, resolve, reject, args) => {
    queue.push(run.bind(null, fn, resolve, reject, args));
    if (active < concurrency && queue.length > 0) {
      queue.shift()();
    }
  };

  return (fn, ...args) => new Promise((resolve, reject) => {
    enqueue(fn, resolve, reject, args);
  });
}

const { v4: uuidv4 } = require("uuid");
const { verifyEmail } = require("./pipeline");

// In-memory store for active batch verification jobs
const activeJobs = new Map();

// Global concurrency limiter (max total simultaneous verifications across all domains)
const GLOBAL_CONCURRENCY = 15;
const globalLimiter = pLimit(GLOBAL_CONCURRENCY);

// Per-domain concurrency limiters to prevent hitting receiving MX servers too hard
const domainLimiters = new Map();
const MAX_PER_DOMAIN_CONCURRENCY = 2;

function getDomainLimiter(domain) {
  const key = (domain || "generic").toLowerCase().trim();
  if (!domainLimiters.has(key)) {
    domainLimiters.set(key, pLimit(MAX_PER_DOMAIN_CONCURRENCY));
  }
  return domainLimiters.get(key);
}

/**
 * Creates a new batch verification job.
 */
function createBatchJob(totalItems, metadata = {}) {
  const jobId = uuidv4();
  const job = {
    jobId,
    status: "queued", // "queued" | "processing" | "completed" | "failed"
    total: totalItems,
    processed: 0,
    counts: {
      deliverable: 0,
      undeliverable: 0,
      risky: 0,
      unknown: 0
    },
    results: [],
    errors: [],
    metadata,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };

  activeJobs.set(jobId, job);
  return job;
}

/**
 * Retrieves the status and results of a batch job.
 */
function getBatchJob(jobId) {
  return activeJobs.get(jobId) || null;
}

/**
 * Processes an array of email objects in a rate-limited, concurrency-controlled batch.
 * 
 * @param {string} jobId
 * @param {Array<{ email: string, originalRow?: object, forceRefresh?: boolean }>} items
 */
async function processBatchJob(jobId, items) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  job.status = "processing";
  job.startedAt = new Date().toISOString();

  const tasks = items.map((item, index) => {
    return globalLimiter(async () => {
      const email = item.email || "";
      const domain = email.split("@")[1] || "unknown";
      const domainLimiter = getDomainLimiter(domain);

      return domainLimiter(async () => {
        try {
          const verdict = await verifyEmail(email, {
            forceRefresh: Boolean(item.forceRefresh)
          });

          // Small pause to be gentle on destination mail servers (50ms)
          await new Promise(r => setTimeout(r, 50));

          job.processed += 1;
          if (verdict.state && job.counts[verdict.state] !== undefined) {
            job.counts[verdict.state] += 1;
          }

          const resultRecord = {
            index,
            email,
            verdict,
            originalRow: item.originalRow || null
          };

          job.results.push(resultRecord);
          return resultRecord;
        } catch (err) {
          job.processed += 1;
          job.counts.unknown += 1;
          const errorRecord = {
            index,
            email,
            error: err.message,
            originalRow: item.originalRow || null
          };
          job.errors.push(errorRecord);
          return errorRecord;
        }
      });
    });
  });

  try {
    await Promise.all(tasks);
    job.status = "completed";
    job.completedAt = new Date().toISOString();
  } catch (err) {
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.error = err.message;
  }

  return job;
}

module.exports = {
  createBatchJob,
  getBatchJob,
  processBatchJob,
  getDomainLimiter
};
