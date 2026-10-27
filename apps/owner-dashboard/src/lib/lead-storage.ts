import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DemoRequest, OnboardingRequest } from "@departmental/shared-types";

const OUTBOX_DIR = path.join(process.cwd(), ".leads-outbox");

function ensureOutboxDir() {
  if (!fs.existsSync(OUTBOX_DIR)) {
    fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  }
}

export interface StoredDemoRequest extends DemoRequest {
  id: string;
  created_at: string;
  source: "web_form";
  synced_to_erp: boolean;
}

export interface StoredOnboardingRequest extends OnboardingRequest {
  id: string;
  created_at: string;
  status: "Pending Review";
  synced_to_erp: boolean;
}

export function saveDemoRequestLocal(data: DemoRequest, id?: string, synced = false): StoredDemoRequest {
  ensureOutboxDir();
  const filePath = path.join(OUTBOX_DIR, "demo_requests.json");
  let items: StoredDemoRequest[] = [];
  if (fs.existsSync(filePath)) {
    try {
      items = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      items = [];
    }
  }

  const record: StoredDemoRequest = {
    ...data,
    id: id || `DEMO-${Date.now().toString(36).toUpperCase()}`,
    created_at: new Date().toISOString(),
    source: "web_form",
    synced_to_erp: synced,
  };

  items.push(record);
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf-8");
  return record;
}

export function saveOnboardingRequestLocal(data: OnboardingRequest, id?: string, synced = false): StoredOnboardingRequest {
  ensureOutboxDir();
  const filePath = path.join(OUTBOX_DIR, "onboarding_requests.json");
  let items: StoredOnboardingRequest[] = [];
  if (fs.existsSync(filePath)) {
    try {
      items = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      items = [];
    }
  }

  const record: StoredOnboardingRequest = {
    ...data,
    id: id || `ONBOARD-${Date.now().toString(36).toUpperCase()}`,
    created_at: new Date().toISOString(),
    status: "Pending Review",
    synced_to_erp: synced,
  };

  items.push(record);
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf-8");
  return record;
}
