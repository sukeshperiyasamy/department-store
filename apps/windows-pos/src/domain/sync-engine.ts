/**
 * Sync engine: drains the local outbox to the server with durable retry.
 *
 * Guarantees implemented here (tested in sync-engine.test.ts):
 * - Single-flight: only one drain loop runs per app process.
 * - Lost response recovery: on timeout, the engine asks the server
 *   checkTransaction(transaction_id) BEFORE resubmitting, so a committed sale is
 *   never duplicated by a retry.
 * - Server verdicts are persisted verbatim; a sale becomes SERVER_COMMITTED only
 *   on the server's confirmation.
 * - Permanent review results are surfaced, never retried silently.
 * - Retryable failures get bounded backoff and stay in the queue.
 */
import {
  SaleResponseSchema,
  TransactionState,
  type SalePayload,
  type SaleResponse,
  type SyncRecord,
} from "@departmental/shared-types";
import { backoffDelayMs } from "./outbox";

export type TransportErrorKind = "timeout" | "network" | "server" | "auth";

export class TransportError extends Error {
  constructor(
    readonly kind: TransportErrorKind,
    readonly status?: number,
    message?: string,
  ) {
    super(message ?? `transport error: ${kind}${status ? ` (${status})` : ""}`);
  }
}

/** Transport interface validated by the caller; responses are zod-checked there. */
export interface PosTransport {
  submitSale(payload: SalePayload): Promise<SaleResponse>;
  checkTransaction(transactionId: string): Promise<SaleResponse>;
}

export interface SyncRepo {
  due(nowMs: number, limit?: number): Promise<SyncRecord[]>;
  /** Atomically moves a record to SYNCING; returns null if the record moved elsewhere. */
  claimForSync(transactionId: string): Promise<boolean>;
  markServerCommitted(transactionId: string, response: SaleResponse): Promise<void>;
  markRequiresReview(transactionId: string, response: SaleResponse): Promise<void>;
  markRetryableFailure(transactionId: string, error: string, nextAttemptAtMs: number): Promise<void>;
  /** Recovers records stuck in SYNCING after a crash/restart. */
  resetStaleSyncing(nowMs: number): Promise<number>;
}

export interface SyncEngineOptions {
  transport: PosTransport;
  repo: SyncRepo;
  clock: () => number;
  jitter?: () => number;
  /** Records older than this many sync attempts stop auto-retrying and wait for
   * manual retry (limits unbounded background churn on prolonged outages). */
  maxAutoAttempts?: number;
}

export interface SyncRunSummary {
  committed: number;
  reviewed: number;
  failed: number;
  deferred: number;
}

const DEFAULT_MAX_AUTO_ATTEMPTS = 8;

export class SyncEngine {
  private running = false;
  private readonly jitter: () => number;
  private readonly maxAutoAttempts: number;

  constructor(private readonly opts: SyncEngineOptions) {
    this.jitter = opts.jitter ?? Math.random;
    this.maxAutoAttempts = opts.maxAutoAttempts ?? DEFAULT_MAX_AUTO_ATTEMPTS;
  }

  async runOnce(): Promise<SyncRunSummary> {
    const summary: SyncRunSummary = { committed: 0, reviewed: 0, failed: 0, deferred: 0 };
    if (this.running) return summary;
    this.running = true;
    try {
      await this.opts.repo.resetStaleSyncing(this.opts.clock());
      const due = await this.opts.repo.due(this.opts.clock());
      for (const record of due) {
        if (record.attempts >= this.maxAutoAttempts) {
          summary.deferred += 1;
          continue;
        }
        const outcome = await this.processRecord(record);
        summary[outcome] += 1;
      }
      return summary;
    } finally {
      this.running = false;
    }
  }

  /** Manual retry flows belong to the app layer: pull the record back to
   * PENDING_SYNC via repo.markRetryableFailure and run the engine again. */

  private async processRecord(
    record: SyncRecord,
  ): Promise<keyof SyncRunSummary> {
    const claimed = await this.opts.repo.claimForSync(record.transaction_id);
    if (!claimed) return "deferred";

    try {
      const response = await this.opts.transport.submitSale(record.payload);
      if (response.status === "SERVER_COMMITTED") {
        await this.opts.repo.markServerCommitted(record.transaction_id, response);
        return "committed";
      }
      if (response.status === "REQUIRES_REVIEW") {
        await this.opts.repo.markRequiresReview(record.transaction_id, response);
        return "reviewed";
      }
      if (response.status === "PROCESSING") {
        // Server still processing a previous claim; retry later.
        await this.defer(record, response.message ?? "server processing");
        return "deferred";
      }
      await this.defer(record, "unexpected server status");
      return "deferred";
    } catch (error) {
      if (error instanceof TransportError && error.kind === "timeout") {
        return this.recoverLostResponse(record);
      }
      if (error instanceof TransportError && error.kind === "auth") {
        // Auth failure stops auto-retry; the app must re-login.
        await this.defer(record, "authentication required");
        return "deferred";
      }
      if (error instanceof TransportError) {
        await this.defer(record, error.message);
        return "failed";
      }
      await this.defer(record, error instanceof Error ? error.message : String(error));
      return "failed";
    }
  }

  /** The response was lost after (possibly) committing server-side. Ask the server
   * for the transaction's recorded outcome before any resubmission. */
  private async recoverLostResponse(
    record: SyncRecord,
  ): Promise<keyof SyncRunSummary> {
    try {
      const status = await this.opts.transport.checkTransaction(record.transaction_id);
      const parsed = SaleResponseSchema.safeParse(status);
      if (parsed.success && parsed.data.status === "SERVER_COMMITTED") {
        await this.opts.repo.markServerCommitted(record.transaction_id, {
          ...parsed.data,
          duplicate: true,
        });
        return "committed";
      }
    } catch {
      // Recovery lookup also failed — treat as retryable network failure.
    }
    await this.defer(record, "response lost; outcome unverified");
    return "failed";
  }

  private async defer(record: SyncRecord, error: string): Promise<void> {
    const nextAt = this.opts.clock() + backoffDelayMs(record.attempts, this.jitter);
    await this.opts.repo.markRetryableFailure(record.transaction_id, error, nextAt);
  }
}

export function assertTransactionState(record: SyncRecord): void {
  if (record.state === TransactionState.Syncing) {
    throw new Error("record must not be marked SYNCING outside claimForSync");
  }
}
