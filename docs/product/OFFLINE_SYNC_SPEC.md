# Offline and Synchronization Specification

## 1. State model

Sales and other local operations use explicit states:

```text
DRAFT → LOCAL_SAVED → PENDING_SYNC → SYNCING → SERVER_COMMITTED
                                      ├→ SYNC_FAILED
                                      └→ REQUIRES_REVIEW
```

`CANCELLED` is allowed only for a draft or a server-approved resolution. A
record is never silently removed from the queue.

## 2. Atomic local persistence

The SQLite transaction must write, in one transaction:

1. The local operation and its full payload.
2. The outbox event containing operation ID, type, schema version and attempt
   metadata.

If either write fails, neither is visible as saved. Tests must simulate a
process failure and reopen the database to verify durability.

## 3. Server idempotency

The server claims an operation UUID in an idempotency table in the same
transaction boundary used to create the business result. A duplicate request:

- returns the recorded result;
- is marked as duplicate for observability;
- never creates a second invoice, stock movement or payment.

Timeout recovery calls `GET/POST /sync/operations/:id` before resubmission.

## 4. Retry policy

- Automatic retries use exponential backoff with jitter.
- Transport failures are retryable.
- Validation, authorization and stock conflicts become `REQUIRES_REVIEW`.
- Attempts are bounded; exhausted items remain visible for manual retry.
- A newer bill must not be blocked behind an exhausted older bill.
- Manual retry requires an authorized user when the server marked the record for
  review.

## 5. Catalog and price changes

- Catalog refresh never mutates pending sales.
- Pending sales retain item IDs and the original displayed estimate.
- The server applies authoritative price/tax rules at submission.
- Any total difference is returned with the server verdict and review reason.
- Deletions require tombstones or a full snapshot; clients must not infer
  deletion from an incomplete incremental response.

## 6. User-visible behavior

The POS always shows:

- number of pending operations;
- last successful sync time;
- current connection state;
- records requiring review;
- retry and diagnostic actions available to the role.

An offline receipt must state that server confirmation is pending and must use
the local transaction ID rather than inventing an official invoice number.

## 7. Conflict handling

Stock conflicts, stale prices, clock-skew failures and payment uncertainty are
review records containing machine code, human message, payload reference and
allowed resolutions. The owner/manager can fix data, retry, cancel where
permitted or record an approved business resolution.
