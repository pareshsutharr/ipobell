import type { Board, IpoStatus, Registrar } from "@/features/ipos/types";
import { supabase } from "@/lib/supabase";

export interface UserPan {
  id: string;
  label: string;
  pan_last4: string;
  created_at: string;
}

export type ApplicationStatus = "pending" | "allotted" | "partial" | "not_allotted" | "not_found" | "manual" | "error";

export interface ApplicationIpo {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  board: Board;
  sub_type: string | null;
  logo_url: string | null;
  status: IpoStatus;
  allotment_date: string | null;
  listing_date: string | null;
  issue_price: number | null;
  lot_size: number | null;
  registrar: Registrar | null;
}

export interface IpoApplication {
  id: string;
  user_id: string;
  ipo_id: string;
  pan_id: string;
  application_no: string | null;
  lots_applied: number | null;
  status: ApplicationStatus;
  shares_allotted: number | null;
  shares_applied: number | null;
  amount_refunded: number | null;
  category: string | null;
  registrar: string | null;
  check_count: number;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_error: string | null;
  notified_at: string | null;
  created_at: string;
  ipo: ApplicationIpo | null;
}

export interface CheckNowResult {
  ok: boolean;
  status?: ApplicationStatus;
  shares_allotted?: number | null;
  message?: string;
  manual_url?: string | null;
}

/** Registrars the server can query automatically; everything else is a manual link. */
export const AUTO_CHECK_DRIVERS = new Set(["mufg", "bigshare"]);

export function isAutoCheckable(registrar: Registrar | null | undefined): boolean {
  return Boolean(registrar?.driver && AUTO_CHECK_DRIVERS.has(registrar.driver));
}

export class PanLimitError extends Error {}
export class InvalidPanError extends Error {}

const APPLICATION_SELECT =
  "*, ipo:ipos(id,slug,name,display_name,board,sub_type,logo_url,status,allotment_date,listing_date,issue_price,lot_size,registrar)";

export async function fetchPans(): Promise<UserPan[]> {
  const { data, error } = await supabase.from("user_pans").select("id,label,pan_last4,created_at").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as UserPan[];
}

export async function addPan(label: string, pan: string): Promise<UserPan> {
  const { data, error } = await supabase.rpc("add_pan", { p_label: label, p_pan: pan });
  if (error) {
    if (error.message.includes("PAN_LIMIT")) throw new PanLimitError(error.hint ?? "Free accounts can save up to 5 PANs. Upgrade to Premium for unlimited.");
    if (error.message.includes("INVALID_PAN")) throw new InvalidPanError("That doesn't look like a valid PAN (e.g. ABCDE1234F).");
    if (error.message.includes("PAN_KEY_MISSING")) throw new Error("PAN storage isn't configured on the server yet.");
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row as UserPan;
}

export async function renamePan(id: string, label: string): Promise<void> {
  const { error } = await supabase.from("user_pans").update({ label }).eq("id", id);
  if (error) throw error;
}

export async function deletePan(id: string): Promise<void> {
  const { error } = await supabase.from("user_pans").delete().eq("id", id);
  if (error) throw error;
}

export async function revealPan(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("reveal_pan", { p_pan_id: id });
  if (error) throw error;
  if (!data) throw new Error("PAN not found");
  return data as string;
}

export async function fetchApplications(): Promise<IpoApplication[]> {
  const { data, error } = await supabase.from("ipo_applications").select(APPLICATION_SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as IpoApplication[];
}

export async function addApplication(ipoId: string, panId: string, applicationNo?: string | null, lots?: number | null): Promise<IpoApplication> {
  const { data, error } = await supabase.rpc("add_application", {
    p_ipo_id: ipoId,
    p_pan_id: panId,
    p_application_no: applicationNo ?? null,
    p_lots: lots ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as IpoApplication;
}

export async function deleteApplication(id: string): Promise<void> {
  const { error } = await supabase.from("ipo_applications").delete().eq("id", id);
  if (error) throw error;
}

/** Ask the server to check one application right now. Never throws for soft failures. */
export async function checkNow(applicationId: string): Promise<CheckNowResult> {
  try {
    const { data, error } = await supabase.functions.invoke("check-allotments", { method: "POST", body: { application_id: applicationId } });
    if (error) return { ok: false, message: error.message || "Check failed. Try again in a minute." };
    const r = (data ?? {}) as CheckNowResult;
    return { ok: Boolean(r.ok), status: r.status, shares_allotted: r.shares_allotted ?? null, message: r.message, manual_url: r.manual_url ?? null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Check failed. Try again in a minute." };
  }
}

/** Save the outcome of an assisted (in-app WebView) registrar check. */
export async function recordManualResult(params: { applicationId: string; status: "allotted" | "partial" | "not_allotted" | "not_found"; shares?: number | null; note?: string | null }): Promise<void> {
  const { error } = await supabase.rpc("record_manual_result", {
    p_application_id: params.applicationId,
    p_status: params.status,
    p_shares: params.shares ?? null,
    p_note: params.note ?? null,
  });
  if (error) throw error;
}
