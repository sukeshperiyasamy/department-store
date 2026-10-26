"use server";

import { redirect } from "next/navigation";
import { logoutSession } from "@/lib/frappe-server";

export async function logoutAction(): Promise<void> {
  await logoutSession();
  redirect("/login");
}
