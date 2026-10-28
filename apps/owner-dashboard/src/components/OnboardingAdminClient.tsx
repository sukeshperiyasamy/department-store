"use client";

import React, { useState, useTransition } from "react";
import { X } from "lucide-react";
import type { OnboardingDetailRecord } from "@departmental/shared-types";
import {
  approveRequestAction,
  rejectRequestAction,
  retryJobAction,
  setTenantStatusAction,
  type AdminActionState,
} from "@/app/actions/admin";

interface OnboardingAdminClientProps {
  initialRequests: OnboardingDetailRecord[];
  totalCount: number;
}

export function OnboardingAdminClient({
  initialRequests,
  totalCount,
}: OnboardingAdminClientProps) {
  const [requests] = useState<OnboardingDetailRecord[]>(initialRequests);
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedRequest, setSelectedRequest] = useState<OnboardingDetailRecord | null>(null);

  // Action Dialog States
  const [actionDialog, setActionDialog] = useState<{
    type: "approve" | "reject" | "retry" | "suspend" | "activate" | null;
    request: OnboardingDetailRecord | null;
  }>({ type: null, request: null });

  const [notesOrReason, setNotesOrReason] = useState("");
  const [actionFeedback, setActionFeedback] = useState<AdminActionState | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filter requests locally
  const filtered = requests.filter((r) => {
    if (selectedFilter !== "ALL" && r.status !== selectedFilter) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        r.business_name.toLowerCase().includes(term) ||
        r.owner_name.toLowerCase().includes(term) ||
        r.preferred_slug.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term)
      );
    }
    return true;
  });

  // KPI counts
  const pendingCount = requests.filter((r) => r.status === "PENDING_REVIEW" || r.status === ("Pending Review" as string)).length;
  const provisioningCount = requests.filter((r) => r.status === "PROVISIONING" || r.status === "APPROVED").length;
  const activeCount = requests.filter((r) => r.status === "ACTIVE" || r.status === "VERIFICATION_PENDING").length;
  const failedCount = requests.filter((r) => r.status === "PROVISIONING_FAILED").length;

  const handleApprove = () => {
    if (!actionDialog.request) return;
    const formData = new FormData();
    formData.set("request_id", actionDialog.request.name);
    formData.set("notes", notesOrReason);

    startTransition(async () => {
      const res = await approveRequestAction(null, formData);
      setActionFeedback(res);
      if (res.success) {
        setTimeout(() => {
          setActionDialog({ type: null, request: null });
          window.location.reload();
        }, 1000);
      }
    });
  };

  const handleReject = () => {
    if (!actionDialog.request) return;
    const formData = new FormData();
    formData.set("request_id", actionDialog.request.name);
    formData.set("reason", notesOrReason);

    startTransition(async () => {
      const res = await rejectRequestAction(null, formData);
      setActionFeedback(res);
      if (res.success) {
        setTimeout(() => {
          setActionDialog({ type: null, request: null });
          window.location.reload();
        }, 1000);
      }
    });
  };

  const handleRetry = () => {
    if (!actionDialog.request) return;
    const formData = new FormData();
    formData.set("request_id", actionDialog.request.name);
    formData.set("reason", notesOrReason);

    startTransition(async () => {
      const res = await retryJobAction(null, formData);
      setActionFeedback(res);
      if (res.success) {
        setTimeout(() => {
          setActionDialog({ type: null, request: null });
          window.location.reload();
        }, 1000);
      }
    });
  };

  const handleSetTenantStatus = (newStatus: "SUSPENDED" | "ACTIVE") => {
    if (!actionDialog.request) return;
    const tenantId = actionDialog.request.tenant?.tenant_id || actionDialog.request.name;
    const formData = new FormData();
    formData.set("tenant_id", tenantId);
    formData.set("new_status", newStatus);
    formData.set("reason", notesOrReason);

    startTransition(async () => {
      const res = await setTenantStatusAction(null, formData);
      setActionFeedback(res);
      if (res.success) {
        setTimeout(() => {
          setActionDialog({ type: null, request: null });
          window.location.reload();
        }, 1000);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="badge badge-success">ACTIVE</span>;
      case "VERIFICATION_PENDING":
        return <span className="badge" style={{ background: "#ccfbf1", color: "#0f766e" }}>VERIFICATION PENDING</span>;
      case "PROVISIONING":
        return <span className="badge" style={{ background: "#e0f2fe", color: "#0369a1" }}>PROVISIONING</span>;
      case "APPROVED":
        return <span className="badge" style={{ background: "#e0e7ff", color: "#4338ca" }}>APPROVED</span>;
      case "PENDING_REVIEW":
      case "Pending Review":
        return <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>PENDING REVIEW</span>;
      case "PROVISIONING_FAILED":
        return <span className="badge badge-error">FAILED</span>;
      case "REJECTED":
        return <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }}>REJECTED</span>;
      case "SUSPENDED":
        return <span className="badge" style={{ background: "#f3f4f6", color: "#374151" }}>SUSPENDED</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Total Requests</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>{totalCount}</div>
        </div>
        <div className="card" style={{ padding: 18, borderLeft: "4px solid #f59e0b" }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "#b45309", textTransform: "uppercase", fontWeight: 700 }}>Pending Review</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#b45309", marginTop: 4 }}>{pendingCount}</div>
        </div>
        <div className="card" style={{ padding: 18, borderLeft: "4px solid #0284c7" }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "#0369a1", textTransform: "uppercase", fontWeight: 700 }}>In Provisioning</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#0369a1", marginTop: 4 }}>{provisioningCount}</div>
        </div>
        <div className="card" style={{ padding: 18, borderLeft: "4px solid var(--accent)" }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--accent)", textTransform: "uppercase", fontWeight: 700 }}>Active / Verified</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)", marginTop: 4 }}>{activeCount}</div>
        </div>
        <div className="card" style={{ padding: 18, borderLeft: "4px solid var(--error)" }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--error)", textTransform: "uppercase", fontWeight: 700 }}>Failed / Blocked</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--error)", marginTop: 4 }}>{failedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ background: "var(--card)", padding: 16, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", marginBottom: 20, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["ALL", "PENDING_REVIEW", "APPROVED", "PROVISIONING", "VERIFICATION_PENDING", "ACTIVE", "PROVISIONING_FAILED", "REJECTED"].map((f) => (
            <button
              key={f}
              type="button"
              className={`btn ${selectedFilter === f ? "btn-primary" : "btn-outline"}`}
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => setSelectedFilter(f)}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>

        <div style={{ minWidth: 260 }}>
          <input
            type="text"
            placeholder="Search store, owner, slug, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", fontSize: "var(--fs-sm)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-sm)", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "12px 16px" }}>Store & Owner</th>
              <th style={{ padding: "12px 16px" }}>Requested Subdomain</th>
              <th style={{ padding: "12px 16px" }}>Plan</th>
              <th style={{ padding: "12px 16px" }}>Status</th>
              <th style={{ padding: "12px 16px" }}>Submitted</th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>Operator Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
                  No onboarding requests found matching filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((req) => (
                <tr key={req.name} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 700, color: "var(--text)" }}>{req.business_name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {req.owner_name} • {req.city}, {req.state} • {req.phone}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontFamily: "monospace", color: "var(--accent)", fontWeight: 600 }}>
                      {req.preferred_slug}.departmentstore.in
                    </span>
                    {req.assigned_site_name && (
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>Site: {req.assigned_site_name}</div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textTransform: "capitalize" }}>{req.requested_plan}</td>
                  <td style={{ padding: "12px 16px" }}>{getStatusBadge(req.status)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted)" }}>
                    {new Date(req.creation).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {/* Inspect Drawer Button */}
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => setSelectedRequest(req)}
                      >
                        Inspect
                      </button>

                      {/* Approve button for pending */}
                      {(req.status === "PENDING_REVIEW" || req.status === ("Pending Review" as string)) && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => {
                            setNotesOrReason("");
                            setActionFeedback(null);
                            setActionDialog({ type: "approve", request: req });
                          }}
                        >
                          Approve
                        </button>
                      )}

                      {/* Reject button for pending */}
                      {(req.status === "PENDING_REVIEW" || req.status === ("Pending Review" as string)) && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 12, color: "var(--error)", borderColor: "var(--error)" }}
                          onClick={() => {
                            setNotesOrReason("");
                            setActionFeedback(null);
                            setActionDialog({ type: "reject", request: req });
                          }}
                        >
                          Reject
                        </button>
                      )}

                      {/* Retry button for failed */}
                      {req.status === "PROVISIONING_FAILED" && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: "4px 10px", fontSize: 12, background: "#ea580c" }}
                          onClick={() => {
                            setNotesOrReason("");
                            setActionFeedback(null);
                            setActionDialog({ type: "retry", request: req });
                          }}
                        >
                          Retry Job
                        </button>
                      )}

                      {/* Suspend / Reactivate for active tenants */}
                      {req.status === "ACTIVE" && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 12, color: "#b45309" }}
                          onClick={() => {
                            setNotesOrReason("");
                            setActionFeedback(null);
                            setActionDialog({ type: "suspend", request: req });
                          }}
                        >
                          Suspend
                        </button>
                      )}

                      {req.status === "SUSPENDED" && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: 12, color: "var(--accent)" }}
                          onClick={() => {
                            setNotesOrReason("");
                            setActionFeedback(null);
                            setActionDialog({ type: "activate", request: req });
                          }}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inspect Detail Drawer / Modal */}
      {selectedRequest && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ background: "#ffffff", width: "100%", maxWidth: 640, height: "100%", padding: 32, overflowY: "auto", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Onboarding Dossier</div>
                <h3 style={{ margin: "4px 0 0", fontSize: 22, color: "var(--text)" }}>{selectedRequest.business_name}</h3>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: "4px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => setSelectedRequest(null)}
              >
                <span>Close</span>
                <X size={13} aria-hidden="true" />
              </button>
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><strong>Owner:</strong> {selectedRequest.owner_name}</div>
                <div><strong>Email:</strong> {selectedRequest.email}</div>
                <div><strong>Phone:</strong> {selectedRequest.phone}</div>
                <div><strong>Location:</strong> {selectedRequest.city}, {selectedRequest.state}</div>
                <div><strong>Subdomain:</strong> <span style={{ fontFamily: "monospace" }}>{selectedRequest.preferred_slug}.departmentstore.in</span></div>
                <div><strong>Plan:</strong> {selectedRequest.requested_plan}</div>
                <div><strong>Status:</strong> {getStatusBadge(selectedRequest.status)}</div>
                <div><strong>Retry Count:</strong> {selectedRequest.retry_count ?? 0}</div>
              </div>
            </div>

            {/* Latest Job Execution Status */}
            {selectedRequest.latest_job && (
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 20, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>Provisioning Job Progress</span>
                  <span className="badge" style={{ background: selectedRequest.latest_job.status === "COMPLETED" ? "#ccfbf1" : selectedRequest.latest_job.status === "FAILED" ? "#fee2e2" : "#e0f2fe", color: "inherit" }}>
                    {selectedRequest.latest_job.status}
                  </span>
                </div>
                <div><strong>Job ID:</strong> <span style={{ fontFamily: "monospace" }}>{selectedRequest.latest_job.job_id}</span></div>
                <div style={{ marginTop: 4 }}><strong>Current Step:</strong> {selectedRequest.latest_job.current_step}</div>
                {selectedRequest.latest_job.sanitized_error && (
                  <div style={{ marginTop: 8, background: "#fef2f2", color: "var(--error)", padding: 8, borderRadius: 4, fontSize: 12 }}>
                    <strong>Sanitized Error:</strong> {selectedRequest.latest_job.sanitized_error}
                  </div>
                )}
              </div>
            )}

            {/* Audit Trail Timeline */}
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: 16, margin: "0 0 12px", color: "var(--text)" }}>Audit History Trail</h4>
              {selectedRequest.audit_logs && selectedRequest.audit_logs.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {selectedRequest.audit_logs.map((log) => (
                    <div key={log.audit_id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 12, fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: "var(--text)" }}>{log.from_status} → {log.to_status}</span>
                        <span style={{ color: "var(--muted)" }}>{new Date(log.timestamp).toLocaleString("en-IN")}</span>
                      </div>
                      <div style={{ color: "var(--muted)" }}>
                        <strong>Actor:</strong> {log.actor} &nbsp;•&nbsp; <strong>Reason:</strong> {log.reason}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No audit logs recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {actionDialog.type && actionDialog.request && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card" style={{ maxWidth: 480, width: "100%", padding: 28 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 20, color: "var(--text)" }}>
              {actionDialog.type === "approve" && "Approve Onboarding Request"}
              {actionDialog.type === "reject" && "Reject Onboarding Request"}
              {actionDialog.type === "retry" && "Retry Failed Provisioning Job"}
              {actionDialog.type === "suspend" && "Suspend Tenant Workspace"}
              {actionDialog.type === "activate" && "Reactivate Tenant Workspace"}
            </h3>
            <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", margin: "0 0 16px" }}>
              Store: <strong>{actionDialog.request.business_name}</strong> ({actionDialog.request.preferred_slug})
            </p>

            {actionFeedback && (
              <div style={{ padding: "8px 12px", borderRadius: 4, marginBottom: 12, fontSize: 13, background: actionFeedback.success ? "#ccfbf1" : "#fef2f2", color: actionFeedback.success ? "#0f766e" : "var(--error)" }}>
                {actionFeedback.message}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="notes">
                {actionDialog.type === "approve" ? "Approval Notes (Optional):" : "Action Reason (Mandatory):"}
              </label>
              <textarea
                id="notes"
                rows={3}
                value={notesOrReason}
                onChange={(e) => setNotesOrReason(e.target.value)}
                placeholder={actionDialog.type === "approve" ? "e.g. Verified trade license and owner phone" : "e.g. Incomplete registration details"}
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 4 }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setActionDialog({ type: null, request: null })}
                disabled={isPending}
              >
                Cancel
              </button>

              {actionDialog.type === "approve" && (
                <button type="button" className="btn btn-primary" onClick={handleApprove} disabled={isPending}>
                  {isPending ? "Approving..." : "Confirm Approval"}
                </button>
              )}
              {actionDialog.type === "reject" && (
                <button type="button" className="btn" style={{ background: "var(--error)", color: "#fff" }} onClick={handleReject} disabled={isPending || notesOrReason.length < 3}>
                  {isPending ? "Rejecting..." : "Confirm Rejection"}
                </button>
              )}
              {actionDialog.type === "retry" && (
                <button type="button" className="btn btn-primary" onClick={handleRetry} disabled={isPending}>
                  {isPending ? "Queuing Retry..." : "Queue Retry Job"}
                </button>
              )}
              {actionDialog.type === "suspend" && (
                <button type="button" className="btn" style={{ background: "#b45309", color: "#fff" }} onClick={() => handleSetTenantStatus("SUSPENDED")} disabled={isPending || notesOrReason.length < 3}>
                  {isPending ? "Suspending..." : "Confirm Suspension"}
                </button>
              )}
              {actionDialog.type === "activate" && (
                <button type="button" className="btn btn-primary" onClick={() => handleSetTenantStatus("ACTIVE")} disabled={isPending || notesOrReason.length < 3}>
                  {isPending ? "Reactivating..." : "Confirm Activation"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
