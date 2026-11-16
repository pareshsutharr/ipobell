// Lead capture for the "Get Listed" tools. Rows land in public.business_leads (RPC) and are forwarded
// to beipoready.com/api/leads by a DB trigger, so app leads reach the same inbox as website leads.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation } from "@tanstack/react-query";
import * as Application from "expo-application";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export type LeadSource = "readiness-tool" | "eligibility-check" | "issue-size-calculator" | "issue-cost-estimator" | "sme-ipo-checklist" | "book-call" | "business-hub" | "balance-sheet-check";

export interface LeadContact {
  name: string;
  phone: string;
  email: string;
  company: string;
}

export interface LeadInput extends LeadContact {
  source: LeadSource;
  message?: string;
  payload?: Record<string, unknown>;
  readinessScore?: number;
}

const CONTACT_KEY = "ipobell.business.contact.v1";

export const EMPTY_CONTACT: LeadContact = { name: "", phone: "", email: "", company: "" };

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
export function normalizePhone(v: string): string {
  return v.replace(/[^0-9+ ]/g, "").slice(0, 16);
}
export function isValidPhone(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

export function validateContact(c: LeadContact): string | null {
  if (c.name.trim().length < 2) return "Please enter your name.";
  const hasPhone = c.phone.trim().length > 0;
  const hasEmail = c.email.trim().length > 0;
  if (!hasPhone && !hasEmail) return "Add a phone number or an email so we can reach you.";
  if (hasPhone && !isValidPhone(c.phone)) return "That phone number doesn't look right.";
  if (hasEmail && !isValidEmail(c.email)) return "That email doesn't look right.";
  return null;
}

/** Remembers name / phone / email on the device so a business owner fills the form once. */
export function useSavedContact(): [LeadContact, (c: LeadContact) => void, boolean] {
  const [contact, setContact] = useState<LeadContact>(EMPTY_CONTACT);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(CONTACT_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<LeadContact>;
          setContact({ ...EMPTY_CONTACT, ...parsed });
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  const save = useCallback((c: LeadContact) => {
    setContact(c);
    AsyncStorage.setItem(CONTACT_KEY, JSON.stringify(c)).catch(() => undefined);
  }, []);
  return [contact, save, loaded];
}

export class LeadError extends Error {}

export async function submitLead(input: LeadInput): Promise<string> {
  const err = validateContact(input);
  if (err) throw new LeadError(err);
  const { data, error } = await supabase.rpc("submit_business_lead", {
    p_source: input.source,
    p_name: input.name.trim(),
    p_phone: input.phone.trim() || null,
    p_email: input.email.trim() || null,
    p_company: input.company.trim() || null,
    p_message: input.message ?? null,
    p_payload: input.payload ?? {},
    p_readiness_score: input.readinessScore ?? null,
    p_app_version: Application.nativeApplicationVersion ?? null,
  });
  if (error) {
    const anyE = error as { message?: string; hint?: string };
    if (anyE.message?.includes("LEAD_LIMIT")) throw new LeadError(anyE.hint ?? "You have sent several requests today. We'll call you back.");
    if (anyE.message?.includes("CONTACT_REQUIRED")) throw new LeadError(anyE.hint ?? "Add a phone number or an email.");
    throw new LeadError(anyE.message ?? "Couldn't send right now. Please try again or call us.");
  }
  return String(data);
}

export function useSubmitLead() {
  return useMutation({ mutationFn: submitLead });
}
