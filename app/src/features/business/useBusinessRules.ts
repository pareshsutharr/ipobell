// Loads public.business_rules and lays the valid values over the bundled rules. Until the request answers (and
// whenever it fails, or the table does not exist on an older backend) the bundled rules are used.
import { useQuery } from "@tanstack/react-query";

import { DEFAULT_RULES, mergeRules, type BusinessRules, type RuleRow } from "@/features/business/rules";
import { reportError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

async function fetchRules(): Promise<BusinessRules> {
  const { data, error } = await supabase.from("business_rules").select("key, value");
  if (error) throw error;
  const merged = mergeRules((data ?? []) as RuleRow[]);
  // A rejected key means someone saved a value the app refuses: tell the team, keep the user on bundled numbers.
  if (merged.rejected.length) reportError(new Error(`business_rules rejected: ${merged.rejected.join(", ")}`), { kind: "handled", context: { rejected: merged.rejected.join(",") } });
  return merged.rules;
}

export function useBusinessRules(): BusinessRules {
  const { data } = useQuery({ queryKey: ["business-rules"], queryFn: fetchRules, staleTime: 30 * 60 * 1000, retry: 1 });
  return data ?? DEFAULT_RULES;
}
