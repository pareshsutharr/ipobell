// Reads public.feature_switches. Until it answers, and whenever it fails, every switch is off.
import { useQuery } from "@tanstack/react-query";

import { ALL_OFF, parseSwitches, type FeatureSwitches } from "@/features/flags/switches";
import { supabase } from "@/lib/supabase";

async function fetchSwitches(): Promise<FeatureSwitches> {
  const { data, error } = await supabase.from("feature_switches").select("key, enabled");
  if (error) return ALL_OFF; // table not there yet, offline, anything else: off
  return parseSwitches(data);
}

export function useFeatureSwitches(): FeatureSwitches {
  const { data } = useQuery({ queryKey: ["feature-switches"], queryFn: fetchSwitches, staleTime: 10 * 60 * 1000, retry: 0 });
  return data ?? ALL_OFF;
}
