import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SaleResponseSchema,
  TransactionState as T,
  type SalePayload,
  type SaleResponse,
  type SyncRecord,
} from "@departmental/shared-types";
import { SyncEngine, TransportError, type SyncRepo } from "./sync-engine";

const committedResponse = (invoiceName: string, transactionId: string) =>
  SaleResponseSchema.parse({
    api_version: 1,
    status: "SERVER_COMMITTED",
    transaction_id: transactionId,
    invoice: {
      doctype: "Sales Invoice",
      name: invoiceName,
      posting_date: "2026-10-26",
      net_total: 20,
      total_taxes_and_charges: 0,
      grand_total: 20,
      rounding_adjustment: 0,
      change_amount: 0,
      currency: "INR",
    },
    error: null,
  });

const reviewResponse = (code: string, transactionId: string) =>
  SaleResponseSchema.parse({
    api_version: 1,
    status: "REQUIRES_REVIEW",
    transaction_id: transactionId,
    invoice: null,
    error: { code, message: "review" },
  });

function makePayload(transactionId: string): SalePayload {
  return {
    api_version: 1,
    transaction_id: transactionId,
    device_id: "counter-1",
    lines: [{ line_id: "l1", item_code: "SKU1", qty: 2 }],
    payments: [{ mode_of_payment: "Cash", amount: 20 }],
  };
}

class MemoryRepo implements SyncRepo {
  records = new Map<string, SyncRecord>();
  committedMarks: string[] = [];
  reviewMarks: string[] = [];
  failures: { id: string; error: string; nextAt: number }[] = [];

  async due(nowMs: number, _limit?: number): Promise<SyncRecord[]> {
    return [...this.records.values()].filter(
      (r) =>
        (r.state === T.PendingSync || r.state === T.SyncFailed) &&
        (r.next_attempt_at ?? 0) <= nowMs,
    );
  }

  async claimForSync(transactionId: string): Promise<boolean> {
    const r = this.records.get(transactionId);
    const claimable = r && (r.state === T.PendingSync || r.state === T.SyncFailed ||
                            r.state === T.RequiresReview);
    if (!claimable) return false;
    r!.state = T.Syncing;
    return true;
  }

  async markServerCommitted(transactionId: string, response: SaleResponse): Promise<void> {
    const r = this.records.get(transactionId)!;
    r.state = T.ServerCommitted;
    r.response = response;
    this.committedMarks.push(transactionId);
  }

  async markRequiresReview(transactionId: string, response: SaleResponse): Promise<void> {
    const r = this.records.get(transactionId)!;
    r.state = T.RequiresReview;
    r.response = response;
    r.last_error_message = response.error?.message;
    this.reviewMarks.push(transactionId);
  }

  async markRetryableFailure(transactionId: string, error: string, nextAttemptAtMs: number): Promise<void> {
    const r = this.records.get(transactionId)!;
    if (r.state === T.Syncing) r.state = T.SyncFailed;
    else if (r.state === T.RequiresReview || r.state === T.SyncFailed) r.state = T.PendingSync;
    r.last_error_message = error;
    r.next_attempt_at = nextAttemptAtMs;
    r.attempts += 1;
    this.failures.push({ id: transactionId, error, nextAt: nextAttemptAtMs });
  }

  async resetStaleSyncing(_nowMs: number): Promise<number> {
    let n = 0;
    for (const r of this.records.values()) {
      if (r.state === T.Syncing) {
        r.state = T.PendingSync;
        n += 1;
      }
    }
    return n;
  }

  add(record: Partial<SyncRecord> & { transaction_id: string }): SyncRecord {
    const full: SyncRecord = {
      state: T.PendingSync,
      payload: makePayload(record.transaction_id),
      attempts: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      receipt_printed: false,
      ...record,
    } as SyncRecord;
    this.records.set(full.transaction_id, full);
    return full;
  }
}

function fixedClock() {
  let now = 1_000_000;
  // 100ms steps so a >=1.6s backoff spans several runOnce calls.
  return () => (now += 100);
}

describe("SyncEngine", () => {
  let repo: MemoryRepo;
  let clock: () => number;

  beforeEach(() => {
    repo = new MemoryRepo();
    clock = fixedClock();
  });

  it("commits a sale on success", async () => {
    repo.add({ transaction_id: "t1" });
    const transport = {
      submit: async (record: SyncRecord) => committedResponse("SINV-0001", record.payload.transaction_id),
      checkTransaction: async () => {
        throw new Error("should not be called");
      },
    };
    const summary = await new SyncEngine({ transport, repo, clock }).runOnce();
    expect(summary.committed).toBe(1);
    expect(repo.records.get("t1")!.state).toBe(T.ServerCommitted);
    expect(repo.records.get("t1")!.response?.invoice?.name).toBe("SINV-0001");
  });

  it("surfaces review results without retrying", async () => {
    repo.add({ transaction_id: "t1" });
    const transport = {
      submit: async (record: SyncRecord) => reviewResponse("ITEM_NOT_FOUND", record.payload.transaction_id),
      checkTransaction: async () => {
        throw new Error("should not be called");
      },
    };
    const summary = await new SyncEngine({ transport, repo, clock }).runOnce();
    expect(summary.reviewed).toBe(1);
    const record = repo.records.get("t1")!;
    expect(record.state).toBe(T.RequiresReview);
    expect(record.last_error_message).toBe("review");
  });

  it("retries network failures with backoff and preserves the record", async () => {
    repo.add({ transaction_id: "t1" });
    const transport = {
      submit: async () => {
        throw new TransportError("network");
      },
      checkTransaction: async () => {
        throw new Error("should not be called");
      },
    };
    const engine = new SyncEngine({ transport, repo, clock });
    await engine.runOnce();
    const record = repo.records.get("t1")!;
    expect(record.state).toBe(T.SyncFailed);
    expect(record.attempts).toBe(1);
    expect(record.next_attempt_at).toBeGreaterThan(clock());

    // Before the backoff expires nothing is due.
    const before = await engine.runOnce();
    expect(before.failed).toBe(0);

    // After it expires, retry happens.
    for (const r of repo.records.values()) r.next_attempt_at = 0;
    await engine.runOnce();
    expect(record.attempts).toBe(2);
  });

  it("recovers a lost response via checkTransaction without resubmitting", async () => {
    repo.add({ transaction_id: "t1" });
    let submitCalls = 0;
    let checkCalls = 0;
    const transport = {
      submit: async () => {
        submitCalls += 1;
        throw new TransportError("timeout");
      },
      checkTransaction: async (id: string) => {
        checkCalls += 1;
        return committedResponse("SINV-RECOVERED", id);
      },
    };
    const summary = await new SyncEngine({ transport, repo, clock }).runOnce();
    expect(submitCalls).toBe(1);
    expect(checkCalls).toBe(1);
    expect(summary.committed).toBe(1);
    const record = repo.records.get("t1")!;
    expect(record.state).toBe(T.ServerCommitted);
    expect(record.response?.duplicate).toBe(true);
  });

  it("keeps retrying when recovery lookup also fails", async () => {
    repo.add({ transaction_id: "t1" });
    const transport = {
      submit: async () => {
        throw new TransportError("timeout");
      },
      checkTransaction: async () => {
        throw new TransportError("network");
      },
    };
    await new SyncEngine({ transport, repo, clock }).runOnce();
    const record = repo.records.get("t1")!;
    expect(record.state).toBe(T.SyncFailed);
    expect(record.last_error_message).toContain("response lost");
  });

  it("does not resubmit a sale the server already has (duplicate delivery)", async () => {
    // The server committed the first attempt but the response was lost; when the
    // retried request reaches the server it returns duplicate=true — the engine
    // must still mark it committed exactly once.
    repo.add({ transaction_id: "t1" });
    const transport = {
      submit: async (record: SyncRecord) => {
        return {
          ...committedResponse("SINV-0001", record.payload.transaction_id),
          duplicate: true,
        };
      },
      checkTransaction: async () => {
        throw new Error("should not be called");
      },
    };
    await new SyncEngine({ transport, repo, clock }).runOnce();
    expect(repo.committedMarks).toEqual(["t1"]);
  });

  it("defers records beyond maxAutoAttempts", async () => {
    const record = repo.add({ transaction_id: "t1", attempts: 8 });
    const transport = {
      submit: async () => committedResponse("SINV-X", "t1"),
      checkTransaction: async () => committedResponse("SINV-X", "t1"),
    };
    const summary = await new SyncEngine({ transport, repo, clock }).runOnce();
    expect(summary.deferred).toBe(1);
    expect(record.state).toBe(T.PendingSync);
    expect(repo.committedMarks).toHaveLength(0);
  });

  it("single-flight: overlapping runs do not double-process", async () => {
    repo.add({ transaction_id: "t1" });
    const gate = Promise.withResolvers<SaleResponse>();
    let submitCalls = 0;
    const transport = {
      submit: () => {
        submitCalls += 1;
        return gate.promise;
      },
      checkTransaction: async () => {
        throw new Error("should not be called");
      },
    };
    const engine = new SyncEngine({ transport, repo, clock });
    const first = engine.runOnce();
    await vi.waitFor(() => expect(submitCalls).toBe(1));

    const second = await engine.runOnce();
    expect(second.committed).toBe(0);

    gate.resolve(committedResponse("SINV-0001", "t1"));
    await first;
    expect(submitCalls).toBe(1);
    expect(repo.records.get("t1")!.state).toBe(T.ServerCommitted);
  }, 15000);

  it("resetStaleSyncing recovers records stuck after an app crash", async () => {
    repo.add({ transaction_id: "t1", state: T.Syncing });
    const transport = {
      submit: async (record: SyncRecord) => committedResponse("SINV-0001", record.payload.transaction_id),
      checkTransaction: async () => {
        throw new Error("should not be called");
      },
    };
    const summary = await new SyncEngine({ transport, repo, clock }).runOnce();
    // Recovered to pending, then claimed and committed in the same run.
    expect(summary.committed).toBe(1);
    expect(repo.records.get("t1")!.state).toBe(T.ServerCommitted);
  });
});
