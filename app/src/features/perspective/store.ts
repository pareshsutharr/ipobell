// Perspective = which side of the app the person is looking at. `role` is what they told us they are
// (saved on the profile); `perspective` is the current header switch, defaulting to the role.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { UserRole } from "@/features/ipos/types";
import { supabase } from "@/lib/supabase";

export type Perspective = UserRole;

const PERSPECTIVE_KEY = "ipobell.perspective.v1";
const ROLE_KEY = "ipobell.role.v1";

interface PerspectiveState {
  hydrated: boolean;
  perspective: Perspective;
  role: UserRole | null;
  hydrate: () => Promise<void>;
  setPerspective: (p: Perspective) => void;
  /** Save the role locally and on the profile (best-effort), and switch the perspective to match. */
  setRole: (role: UserRole, userId: string | null) => Promise<void>;
  /** Adopt a role that already exists on the server profile (another device / older install). */
  adoptRole: (role: UserRole) => void;
  reset: () => Promise<void>;
}

function isRole(v: unknown): v is UserRole {
  return v === "investor" || v === "business";
}

export const usePerspective = create<PerspectiveState>((set, get) => ({
  hydrated: false,
  perspective: "investor",
  role: null,

  hydrate: async () => {
    try {
      const [p, r] = await Promise.all([AsyncStorage.getItem(PERSPECTIVE_KEY), AsyncStorage.getItem(ROLE_KEY)]);
      set({ hydrated: true, role: isRole(r) ? r : null, perspective: isRole(p) ? p : isRole(r) ? r : "investor" });
    } catch {
      set({ hydrated: true });
    }
  },

  setPerspective: (perspective) => {
    if (perspective === get().perspective) return;
    set({ perspective });
    AsyncStorage.setItem(PERSPECTIVE_KEY, perspective).catch(() => undefined);
  },

  setRole: async (role, userId) => {
    set({ role, perspective: role });
    await Promise.all([AsyncStorage.setItem(ROLE_KEY, role), AsyncStorage.setItem(PERSPECTIVE_KEY, role)]).catch(() => undefined);
    if (userId) {
      await supabase
        .from("profiles")
        .upsert({ id: userId, role }, { onConflict: "id" })
        .then(({ error }) => {
          if (error) console.warn("profile role update failed", error.message);
        });
    }
  },

  adoptRole: (role) => {
    if (get().role === role) return;
    set({ role, perspective: role });
    Promise.all([AsyncStorage.setItem(ROLE_KEY, role), AsyncStorage.setItem(PERSPECTIVE_KEY, role)]).catch(() => undefined);
  },

  reset: async () => {
    set({ role: null, perspective: "investor" });
    await AsyncStorage.multiRemove([ROLE_KEY, PERSPECTIVE_KEY]).catch(() => undefined);
  },
}));

export const ROLE_COPY: Record<UserRole, { title: string; short: string; body: string }> = {
  investor: { title: "I invest in IPOs", short: "Investor", body: "Live IPO list, GMP, subscription, allotment status and alerts for the dates that matter." },
  business: { title: "I own or run a business", short: "Business owner", body: "Learn how companies like yours got listed, check your IPO readiness and talk to the advisors." },
};
