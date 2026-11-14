// Listed peers in a sector (public.sector_peers). A backend without the function, or a sector nobody has been
// tagged with yet, simply yields no peers; the tools then say so.
import { useQuery } from "@tanstack/react-query";

import { parsePeer, type Peer } from "@/features/business/peers";
import { supabase } from "@/lib/supabase";

async function fetchPeers(sector: string): Promise<Peer[]> {
  const { data, error } = await supabase.rpc("sector_peers", { p_sector: sector });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(parsePeer);
}

export function usePeers(sector: string | null) {
  return useQuery({ queryKey: ["sector-peers", sector ?? ""], queryFn: () => fetchPeers(sector as string), enabled: Boolean(sector), staleTime: 30 * 60 * 1000, retry: false });
}
