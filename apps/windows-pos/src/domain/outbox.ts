/**
 * Transaction sync state machine (counter side).
 *
 * Contract (docs/offline-sync-policy.md):
 * - A sale is SERVER_COMMITTED only after the server returns that verdict.
 * - Never silently discard a pending sale; failures surface as SYNC_FAILED with a
 *   next attempt time, or REQUIRES_REVIEW with the server's error.
 * - State changes are guarded in the repository (UPDATE ... WHERE state = X) so a
 *   stale writer cannot overwrite a newer state after app restarts.
 */
import { TransactionState, type SyncRecord } from "@departmental/shared-types";

export type State = (typeof TransactionState)[keyof typeof TransactionState];

export type TransitionEvent =
  | "SAVED_AND_ENQUEUED"
  | "CLAIM_FOR_SYNC"
  | "SERVER_COMMITTED"
  | "SYNC_FAILED_RETRYABLE"
  | "REVIEW_REQUIRED"
  | "RETRY_NOW"
  | "CANCELLED";

const ALLOWED: Record<State, Partial<Record<TransitionEvent, State>>> = {
  [TransactionState.Draft]: {
    SAVED_AND_ENQUEUED: TransactionState.PendingSync,
    CANCELLED: TransactionState.Cancelled,
  },
  [TransactionState.LocalSaved]: {
    SAVED_AND_ENQUEUED: TransactionState.PendingSync,
    CANCELLED: TransactionState.Cancelled,
  },
  [TransactionState.PendingSync]: {
    CLAIM_FOR_SYNC: TransactionState.Syncing,
    // Re-defer (e.g. server says PROCESSING) keeps it pending with a later attempt.
    RETRY_NOW: TransactionState.PendingSync,
    CANCELLED: TransactionState.Cancelled,
  },
  [TransactionState.Syncing]: {
    SERVER_COMMITTED: TransactionState.ServerCommitted,
    SYNC_FAILED_RETRYABLE: TransactionState.SyncFailed,
    REVIEW_REQUIRED: TransactionState.RequiresReview,
  },
  // Auto-retry when the backoff expires; the engine re-claims directly.
  [TransactionState.SyncFailed]: {
    CLAIM_FOR_SYNC: TransactionState.Syncing,
    RETRY_NOW: TransactionState.PendingSync,
    CANCELLED: TransactionState.Cancelled,
  },
  // Manual retry from the review screen re-claims directly after a manager fix.
  [TransactionState.RequiresReview]: {
    CLAIM_FOR_SYNC: TransactionState.Syncing,
    RETRY_NOW: TransactionState.PendingSync,
    CANCELLED: TransactionState.Cancelled,
  },
  [TransactionState.ServerCommitted]: {},
  [TransactionState.Cancelled]: {},
};

export class InvalidTransitionError extends Error {
  constructor(readonly from: State, readonly event: TransitionEvent) {
    super(`invalid transition ${event} from ${from}`);
  }
}

export function transition(from: State, event: TransitionEvent): State {
  const next = ALLOWED[from]?.[event];
  if (!next) throw new InvalidTransitionError(from, event);
  return next;
}

export function canTransition(from: State, event: TransitionEvent): boolean {
  return Boolean(ALLOWED[from]?.[event]);
}

/** Bounded exponential backoff with jitter, capped at 5 minutes. */
export function backoffDelayMs(attempts: number, jitter: () => number = Math.random): number {
  const base = Math.min(2000 * 2 ** attempts, 300000);
  return Math.round(base * (0.8 + 0.4 * jitter()));
}

export function isTerminal(state: State): boolean {
  return state === TransactionState.ServerCommitted || state === TransactionState.Cancelled;
}

export function describeRecordState(record: SyncRecord): string {
  switch (record.state) {
    case TransactionState.PendingSync:
      return "Saved on this counter, waiting to sync";
    case TransactionState.Syncing:
      return "Syncing to server…";
    case TransactionState.SyncFailed:
      return `Sync failed: ${record.last_error_message ?? "network error"}. Will retry.`;
    case TransactionState.RequiresReview:
      return `Needs review: ${record.last_error_message ?? "server rejected this bill"}`;
    case TransactionState.ServerCommitted:
      return `Committed on server as ${record.response?.invoice?.name ?? "invoice"}`;
    case TransactionState.LocalSaved:
      return "Saved locally";
    case TransactionState.Draft:
      return "Draft";
    case TransactionState.Cancelled:
      return "Cancelled";
    default:
      return String(record.state);
  }
}
