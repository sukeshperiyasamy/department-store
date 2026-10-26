import { describe, expect, it } from "vitest";
import {
  InvalidTransitionError,
  backoffDelayMs,
  canTransition,
  isTerminal,
  transition,
} from "./outbox";
import { TransactionState as T } from "@departmental/shared-types";

describe("state machine", () => {
  it("moves pending -> syncing -> committed", () => {
    expect(transition(T.PendingSync, "CLAIM_FOR_SYNC")).toBe(T.Syncing);
    expect(transition(T.Syncing, "SERVER_COMMITTED")).toBe(T.ServerCommitted);
  });

  it("moves syncing -> failed -> pending (retry) -> committed", () => {
    expect(transition(T.Syncing, "SYNC_FAILED_RETRYABLE")).toBe(T.SyncFailed);
    expect(transition(T.SyncFailed, "RETRY_NOW")).toBe(T.PendingSync);
    expect(transition(T.PendingSync, "CLAIM_FOR_SYNC")).toBe(T.Syncing);
    expect(transition(T.Syncing, "SERVER_COMMITTED")).toBe(T.ServerCommitted);
  });

  it("moves syncing -> review, review -> retry", () => {
    expect(transition(T.Syncing, "REVIEW_REQUIRED")).toBe(T.RequiresReview);
    expect(transition(T.RequiresReview, "RETRY_NOW")).toBe(T.PendingSync);
  });

  it("allows cancellation of non-terminal states", () => {
    for (const state of [T.Draft, T.LocalSaved, T.PendingSync, T.SyncFailed, T.RequiresReview]) {
      expect(transition(state, "CANCELLED")).toBe(T.Cancelled);
    }
  });

  it("auto-retries failed records directly into syncing", () => {
    expect(transition(T.SyncFailed, "CLAIM_FOR_SYNC")).toBe(T.Syncing);
    expect(transition(T.RequiresReview, "CLAIM_FOR_SYNC")).toBe(T.Syncing);
  });

  it("re-defer of a pending record keeps it pending", () => {
    expect(transition(T.PendingSync, "RETRY_NOW")).toBe(T.PendingSync);
  });

  it("rejects committing a sale that was never confirmed", () => {
    expect(() => transition(T.PendingSync, "SERVER_COMMITTED")).toThrow(InvalidTransitionError);
    expect(() => transition(T.Draft, "SERVER_COMMITTED")).toThrow(InvalidTransitionError);
  });

  it("terminal states accept nothing", () => {
    expect(isTerminal(T.ServerCommitted)).toBe(true);
    expect(isTerminal(T.Cancelled)).toBe(true);
    expect(() => transition(T.ServerCommitted, "RETRY_NOW")).toThrow(InvalidTransitionError);
    expect(canTransition(T.Cancelled, "CANCELLED")).toBe(false);
  });

  it("crash recovery: syncing returns to pending via failure", () => {
    expect(transition(T.Syncing, "SYNC_FAILED_RETRYABLE")).toBe(T.SyncFailed);
    expect(transition(T.SyncFailed, "RETRY_NOW")).toBe(T.PendingSync);
  });
});

describe("backoff", () => {
  it("grows exponentially and caps at 5 minutes", () => {
    expect(backoffDelayMs(0, () => 0.5)).toBeGreaterThanOrEqual(1600);
    expect(backoffDelayMs(1, () => 0.5)).toBeGreaterThan(backoffDelayMs(0, () => 0.5));
    for (let i = 0; i < 30; i++) {
      expect(backoffDelayMs(i, () => 0.5)).toBeLessThanOrEqual(300000 * 1.2);
    }
  });

  it("adds bounded jitter", () => {
    const low = backoffDelayMs(0, () => 0);
    const high = backoffDelayMs(0, () => 1);
    expect(high).toBeGreaterThan(low);
  });
});
