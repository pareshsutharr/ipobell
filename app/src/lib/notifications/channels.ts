import { Platform } from "react-native";

import { Notifications } from "@/lib/notifications/native";

const { AndroidImportance } = Notifications;

// Must match CHANNEL_FOR_TYPE in supabase/functions/_shared/notify.ts
export const CHANNELS = [
  { id: "default", name: "General", description: "App updates and other alerts", importance: AndroidImportance.DEFAULT },
  { id: "new_ipo", name: "New IPOs", description: "A new IPO is announced", importance: AndroidImportance.DEFAULT },
  { id: "reminders", name: "Open & close reminders", description: "IPO opens today, closes today, closing soon", importance: AndroidImportance.HIGH },
  { id: "allotment", name: "Allotment, refund & demat", description: "Allotment status, refunds and demat credit", importance: AndroidImportance.HIGH },
  { id: "listing", name: "Listing", description: "Listing day reminders and listing results", importance: AndroidImportance.HIGH },
  { id: "subscription", name: "Subscription milestones", description: "Retail / NII / QIB subscription crosses 1x, 2x, 5x, 10x…", importance: AndroidImportance.DEFAULT },
  { id: "gmp", name: "GMP alerts", description: "Grey market premium moves on watchlisted IPOs", importance: AndroidImportance.DEFAULT },
] as const;

export async function setupNotificationChannels(accentColor: string) {
  if (Platform.OS !== "android") return;
  await Promise.all(
    CHANNELS.map((c) =>
      Notifications.setNotificationChannelAsync(c.id, {
        name: c.name,
        description: c.description,
        importance: c.importance,
        lightColor: accentColor,
        vibrationPattern: [0, 120, 80, 120],
        showBadge: true,
        enableVibrate: true,
      }),
    ),
  );
}
