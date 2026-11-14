import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { NotificationPreferences, Profile } from "@/features/ipos/types";
import { useAuth } from "@/lib/auth/store";
import { qk } from "@/lib/query";
import { supabase } from "@/lib/supabase";

export function useUserId(): string | null {
  return useAuth((s) => s.user?.id ?? null);
}

export function useProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.profile(userId),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId as string).maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
  });
}

export function useNotificationPreferences() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.prefs(userId),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_preferences").select("*").eq("user_id", userId as string).maybeSingle();
      if (error) throw error;
      if (data) return data as NotificationPreferences;
      // row is created by trigger; fall back to defaults if it isn't there yet
      const { data: created, error: e2 } = await supabase.from("notification_preferences").upsert({ user_id: userId as string }, { onConflict: "user_id" }).select("*").single();
      if (e2) throw e2;
      return created as NotificationPreferences;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<NotificationPreferences, "user_id">>) => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .update(patch)
        .eq("user_id", userId as string)
        .select("*")
        .single();
      if (error) throw error;
      return data as NotificationPreferences;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.prefs(userId) });
      const prev = qc.getQueryData<NotificationPreferences>(qk.prefs(userId));
      if (prev) qc.setQueryData(qk.prefs(userId), { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.prefs(userId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.prefs(userId) }),
  });
}
