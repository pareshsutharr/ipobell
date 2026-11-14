import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  addApplication,
  addPan,
  checkNow,
  deleteApplication,
  deletePan,
  fetchApplications,
  fetchPans,
  recordManualResult,
  renamePan,
  type IpoApplication,
  type UserPan,
} from "@/features/applications/api";
import { useUserId } from "@/lib/auth/hooks";
import { supabase } from "@/lib/supabase";

export const FREE_PAN_LIMIT = 10;

export const appKeys = {
  pans: (userId: string | null) => ["pans", userId] as const,
  applications: (userId: string | null) => ["applications", userId] as const,
};

export function usePans() {
  const userId = useUserId();
  return useQuery({ queryKey: appKeys.pans(userId), queryFn: fetchPans, enabled: Boolean(userId), staleTime: 5 * 60 * 1000 });
}

export function useApplications() {
  const userId = useUserId();
  return useQuery({ queryKey: appKeys.applications(userId), queryFn: fetchApplications, enabled: Boolean(userId), staleTime: 60 * 1000 });
}

export function useAddPan() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, pan }: { label: string; pan: string }) => addPan(label, pan),
    onSuccess: (row) => {
      qc.setQueryData<UserPan[]>(appKeys.pans(userId), (prev) => {
        const list = prev ?? [];
        return list.some((p) => p.id === row.id) ? list.map((p) => (p.id === row.id ? row : p)) : [...list, row];
      });
    },
  });
}

export function useRenamePan() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => renamePan(id, label),
    onSuccess: (_r, { id, label }) => {
      qc.setQueryData<UserPan[]>(appKeys.pans(userId), (prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, label } : p)));
    },
  });
}

export function useDeletePan() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePan(id),
    onSuccess: (_r, id) => {
      qc.setQueryData<UserPan[]>(appKeys.pans(userId), (prev) => (prev ?? []).filter((p) => p.id !== id));
      qc.invalidateQueries({ queryKey: appKeys.applications(userId) });
    },
  });
}

export function useAddApplication() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ipoId, panId, applicationNo, lots }: { ipoId: string; panId: string; applicationNo?: string | null; lots?: number | null }) =>
      addApplication(ipoId, panId, applicationNo, lots),
    onSettled: () => qc.invalidateQueries({ queryKey: appKeys.applications(userId) }),
  });
}

export function useDeleteApplication() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApplication(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: appKeys.applications(userId) });
      const prev = qc.getQueryData<IpoApplication[]>(appKeys.applications(userId));
      qc.setQueryData<IpoApplication[]>(appKeys.applications(userId), (list) => (list ?? []).filter((a) => a.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(appKeys.applications(userId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: appKeys.applications(userId) }),
  });
}

export function useCheckNow() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => checkNow(id),
    onSettled: () => qc.invalidateQueries({ queryKey: appKeys.applications(userId) }),
  });
}

/** Refresh the list whenever the server job writes a result for this user. */
export function useApplicationsRealtime(userId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`applications:${userId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ipo_applications", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: appKeys.applications(userId) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

export function useRecordManualResult() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recordManualResult,
    onSettled: () => qc.invalidateQueries({ queryKey: ["applications", userId] }),
  });
}
