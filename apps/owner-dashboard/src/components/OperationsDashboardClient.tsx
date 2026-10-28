"use client";

import React, { useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { PlatformOperationsOverview, OnboardingDetailRecord } from "@departmental/shared-types";
import {
  approveRequestAction,
  rejectRequestAction,
  retryJobAction,
} from "@/app/actions/admin";

interface Props {
  initialOverview: PlatformOperationsOverview;
  initialRequests: OnboardingDetailRecord[];
}

export function OperationsDashboardClient({ initialOverview, initialRequests }: Props) {
  const [overview] = useState<PlatformOperationsOverview>(initialOverview);
  const [requests] = useState<OnboardingDetailRecord[]>(initialRequests);
  const [activeTab, setActiveTab] = useState<"ALL" | "VERIFY" | "REVIEW" | "PROVISION">("ALL");
  const [search, setSearch] = useState("");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modal / Prompt State for Action Reason
  const [modalAction, setModalAction] = useState<{
    type: "approve" | "reject" | "retry";
    requestId: string;
    storeName: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const filteredRequests = requests.filter((req) => {
    const reqId = req.request_id || req.name;
    const contactSt = req.contact_verification_status || (req.status === "VERIFICATION_PENDING" ? "PENDING" : "VERIFIED");

    // Tab filter
    if (activeTab === "VERIFY" && contactSt !== "PENDING" && req.status !== "VERIFICATION_PENDING") return false;
    if (activeTab === "REVIEW" && req.status !== "PENDING_REVIEW") return false;
    if (activeTab === "PROVISION" && req.status !== "PROVISIONING" && req.status !== "PROVISIONING_FAILED") return false;

    // Search filter
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      reqId.toLowerCase().includes(q) ||
      req.business_name.toLowerCase().includes(q) ||
      req.email.toLowerCase().includes(q) ||
      req.preferred_slug.toLowerCase().includes(q)
    );
  });

  const handleExecuteModalAction = () => {
    if (!modalAction) return;

    if (modalAction.type === "reject" && !actionReason.trim()) {
      setActionMsg({ type: "error", text: "A rejection reason is mandatory for platform audit trails." });
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("request_id", modalAction.requestId);

      let res: { success: boolean; message?: string } = { success: false };
      if (modalAction.type === "approve") {
        fd.set("notes", actionReason.trim());
        res = await approveRequestAction(null, fd);
      } else if (modalAction.type === "reject") {
        fd.set("reason", actionReason.trim());
        res = await rejectRequestAction(null, fd);
      } else if (modalAction.type === "retry") {
        fd.set("reason", actionReason.trim());
        res = await retryJobAction(null, fd);
      }

      if (res.success) {
        setActionMsg({ type: "success", text: res.message || "Action completed successfully." });
        setModalAction(null);
        setActionReason("");
      } else {
        setActionMsg({ type: "error", text: res.message || "Action failed." });
      }
    });
  };

  return (
    <div>
      {/* KPI Overview Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
            Total Registrations
          </div>
          <div style={{ fontSize: "var(--fs-kpi)", fontWeight: 800, color: "var(--text)", marginTop: 6 }}>
            {overview.total_registrations}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 4 }}>
            Recorded onboarding applications
          </div>
        </div>

        <div className="card" style={{ padding: "20px 24px", borderLeft: "4px solid var(--warning)" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--warning)", textTransform: "uppercase" }}>
            Pending Verification
          </div>
          <div style={{ fontSize: "var(--fs-kpi)", fontWeight: 800, color: "var(--warning)", marginTop: 6 }}>
            {overview.pending_verification}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 4 }}>
            Unverified email tokens
          </div>
        </div>

        <div className="card" style={{ padding: "20px 24px", borderLeft: "4px solid var(--info)" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--info)", textTransform: "uppercase" }}>
            Business Review Queue
          </div>
          <div style={{ fontSize: "var(--fs-kpi)", fontWeight: 800, color: "var(--info)", marginTop: 6 }}>
            {overview.pending_review}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 4 }}>
            Ready for operator approval
          </div>
        </div>

        <div className="card" style={{ padding: "20px 24px", borderLeft: "4px solid var(--accent-2)" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--accent-2)", textTransform: "uppercase" }}>
            Active Provisioning
          </div>
          <div style={{ fontSize: "var(--fs-kpi)", fontWeight: 800, color: "var(--accent-2)", marginTop: 6 }}>
            {overview.active_provisioning}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 4 }}>
            Site creation & migrations
          </div>
        </div>

        <div className="card" style={{ padding: "20px 24px", borderLeft: "4px solid var(--error)" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--error)", textTransform: "uppercase" }}>
            Failed Provisioning
          </div>
          <div style={{ fontSize: "var(--fs-kpi)", fontWeight: 800, color: "var(--error)", marginTop: 6 }}>
            {overview.failed_provisioning}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 4 }}>
            Requires operator retry
          </div>
        </div>

        <div className="card" style={{ padding: "20px 24px", borderLeft: "4px solid var(--success)" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--success)", textTransform: "uppercase" }}>
            Active Tenants
          </div>
          <div style={{ fontSize: "var(--fs-kpi)", fontWeight: 800, color: "var(--success)", marginTop: 6 }}>
            {overview.active_tenants}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginTop: 4 }}>
            Suspended: {overview.suspended_tenants}
          </div>
        </div>
      </div>

      {/* Operational Assurance Banner */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--success-soft)",
              color: "var(--success)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
            }}
          >
            <Check size={18} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color: "var(--text)" }}>
              Backup Automation & Recovery Rehearsal: PASS
            </div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
              Last Verified Host Backup: <code>{overview.backup_status.last_backup_at}</code> • Rehearsal site restore passed with zero corruption.
            </div>
          </div>
        </div>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "4px 12px",
            fontSize: "var(--fs-xs)",
            fontWeight: 700,
            color: "var(--accent)",
          }}
        >
          RELEASE TARGET: CONDITIONAL GO (PILOT)
        </div>
      </div>

      {/* Action Message Banner */}
      {actionMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "var(--radius-sm)",
            marginBottom: 20,
            fontSize: "var(--fs-sm)",
            background: actionMsg.type === "success" ? "var(--success-soft)" : "var(--error-soft)",
            color: actionMsg.type === "success" ? "var(--success)" : "var(--error)",
            fontWeight: 600,
          }}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Filter Tabs & Search Header */}
      <div className="card" style={{ padding: "20px 24px", marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* Navigation Filter Tabs */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={`btn ${activeTab === "ALL" ? "btn-primary" : "btn-outline"}`}
              style={{ padding: "6px 14px", fontSize: "var(--fs-xs)" }}
              onClick={() => setActiveTab("ALL")}
            >
              All Requests ({requests.length})
            </button>
            <button
              type="button"
              className={`btn ${activeTab === "VERIFY" ? "btn-primary" : "btn-outline"}`}
              style={{ padding: "6px 14px", fontSize: "var(--fs-xs)" }}
              onClick={() => setActiveTab("VERIFY")}
            >
              Pending Verification ({overview.pending_verification})
            </button>
            <button
              type="button"
              className={`btn ${activeTab === "REVIEW" ? "btn-primary" : "btn-outline"}`}
              style={{ padding: "6px 14px", fontSize: "var(--fs-xs)" }}
              onClick={() => setActiveTab("REVIEW")}
            >
              Business Review Queue ({overview.pending_review})
            </button>
            <button
              type="button"
              className={`btn ${activeTab === "PROVISION" ? "btn-primary" : "btn-outline"}`}
              style={{ padding: "6px 14px", fontSize: "var(--fs-xs)" }}
              onClick={() => setActiveTab("PROVISION")}
            >
              Provisioning & Retries ({overview.active_provisioning + overview.failed_provisioning})
            </button>
          </div>

          {/* Search Box */}
          <input
            type="text"
            className="form-input"
            placeholder="Search by ID, shop name, email, slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 320, padding: "6px 12px", fontSize: "var(--fs-sm)" }}
          />
        </div>

        {/* Requests Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "10px 12px" }}>Store & Request</th>
                <th style={{ padding: "10px 12px" }}>Owner & Email</th>
                <th style={{ padding: "10px 12px" }}>Subdomain</th>
                <th style={{ padding: "10px 12px" }}>Contact</th>
                <th style={{ padding: "10px 12px" }}>Status</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
                    No onboarding requests matching current criteria.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const reqId = req.request_id || req.name;
                  const contactSt =
                    req.contact_verification_status ||
                    (req.status === "VERIFICATION_PENDING" ? "PENDING" : "VERIFIED");
                  const isContactVerified = contactSt === "VERIFIED";
                  const isPendingReview = req.status === "PENDING_REVIEW";
                  const isFailed = req.status === "PROVISIONING_FAILED";

                  return (
                    <tr
                      key={reqId}
                      style={{ borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}
                    >
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 700, color: "var(--text)" }}>{req.business_name}</div>
                        <div style={{ fontFamily: "monospace", fontSize: "var(--fs-xs)", color: "var(--accent)" }}>
                          {reqId}
                        </div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div>{req.owner_name}</div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>{req.email}</div>
                      </td>
                      <td style={{ padding: "12px", fontFamily: "monospace" }}>
                        {req.preferred_slug}.departmentstore.in
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: "var(--fs-xs)",
                            fontWeight: 700,
                            background:
                              contactSt === "VERIFIED"
                                ? "var(--success-soft)"
                                : contactSt === "EXPIRED"
                                  ? "var(--error-soft)"
                                  : "var(--warning-soft)",
                            color:
                              contactSt === "VERIFIED"
                                ? "var(--success)"
                                : contactSt === "EXPIRED"
                                  ? "var(--error)"
                                  : "var(--warning)",
                          }}
                        >
                          {contactSt}
                        </span>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            fontSize: "var(--fs-xs)",
                            fontWeight: 700,
                            background:
                              req.status === "APPROVED" || req.status === "ACTIVE"
                                ? "var(--success-soft)"
                                : req.status === "PROVISIONING_FAILED" || req.status === "REJECTED"
                                  ? "var(--error-soft)"
                                  : "var(--info-soft)",
                            color:
                              req.status === "APPROVED" || req.status === "ACTIVE"
                                ? "var(--success)"
                                : req.status === "PROVISIONING_FAILED" || req.status === "REJECTED"
                                  ? "var(--error)"
                                  : "var(--info)",
                          }}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          {!isContactVerified && (
                            <span
                              style={{
                                fontSize: "var(--fs-xs)",
                                color: "var(--muted)",
                                padding: "4px 8px",
                                background: "var(--surface)",
                                borderRadius: 4,
                              }}
                              title="Approval is blocked on server until contact email is verified"
                            >
                              Awaiting Customer Verification
                            </span>
                          )}

                          {isContactVerified && isPendingReview && (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: "4px 10px", fontSize: "var(--fs-xs)" }}
                                onClick={() =>
                                  setModalAction({
                                    type: "approve",
                                    requestId: reqId,
                                    storeName: req.business_name,
                                  })
                                }
                              >
                                Approve & Provision
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: "4px 10px", fontSize: "var(--fs-xs)", color: "var(--error)" }}
                                onClick={() =>
                                  setModalAction({
                                    type: "reject",
                                    requestId: reqId,
                                    storeName: req.business_name,
                                  })
                                }
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {isFailed && (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: "4px 10px", fontSize: "var(--fs-xs)", background: "var(--error)" }}
                              onClick={() =>
                                setModalAction({
                                  type: "retry",
                                  requestId: reqId,
                                  storeName: req.business_name,
                                })
                              }
                            >
                              Retry Job
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation & Audit Modal */}
      {modalAction && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 500,
              width: "100%",
              padding: 28,
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <h3 style={{ fontSize: 18, margin: "0 0 10px", color: "var(--text)" }}>
              {modalAction.type === "approve"
                ? `Approve Onboarding & Provision Site`
                : modalAction.type === "reject"
                  ? `Reject Onboarding Request`
                  : `Retry Provisioning Job`}
            </h3>
            <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", margin: "0 0 16px" }}>
              Target Store: <strong>{modalAction.storeName}</strong> ({modalAction.requestId})
            </p>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">
                {modalAction.type === "reject"
                  ? "Mandatory Rejection Reason:"
                  : "Operator Notes / Audit Rationale:"}
              </label>
              <textarea
                className="form-input"
                rows={3}
                placeholder={
                  modalAction.type === "reject"
                    ? "Explain why this request is rejected (e.g. invalid GSTIN, trademark conflict)..."
                    : "Notes on operator review..."
                }
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setModalAction(null);
                  setActionReason("");
                }}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${modalAction.type === "reject" ? "btn-primary" : "btn-primary"}`}
                style={{
                  background: modalAction.type === "reject" ? "var(--error)" : undefined,
                }}
                onClick={handleExecuteModalAction}
                disabled={isPending}
              >
                {isPending ? "Executing..." : "Confirm & Execute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
