// Firebase Cloud Messaging HTTP v1 sender, formatted for expo-notifications on Android.
import { config } from "./env.ts";
import { getAccessToken, parseServiceAccount, type ServiceAccount } from "./google.ts";
import { pool } from "./http.ts";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export interface PushMessage {
  title: string;
  body: string;
  /** Android notification channel id — one per category (see app/src/lib/notifications/channels.ts). */
  channelId: string;
  /** Custom payload delivered to the app (deep link info etc.). */
  data: Record<string, string>;
  imageUrl?: string;
}

export type SendOutcome =
  | { token: string; ok: true; messageId: string }
  | { token: string; ok: false; invalidToken: boolean; error: string };

let sa: ServiceAccount | null = null;

function serviceAccount(): ServiceAccount {
  if (sa) return sa;
  const raw = config.fcmServiceAccountJson;
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON secret is not set");
  sa = parseServiceAccount(raw);
  return sa;
}

export function fcmConfigured(): boolean {
  return Boolean(config.fcmServiceAccountJson);
}

/**
 * Build the FCM v1 message body. expo-notifications (Android) reads these `data` keys:
 *   title, message (notification text), body (JSON string → notification.request.content.data), channelId
 */
export function buildFcmMessage(token: string, msg: PushMessage) {
  return {
    message: {
      token,
      // `notification` makes Android display the alert itself even when the app is killed or
      // battery-restricted (Samsung/Xiaomi). The data block carries the deep link for the tap handler.
      notification: { title: msg.title, body: msg.body, ...(msg.imageUrl ? { image: msg.imageUrl } : {}) },
      android: {
        priority: "high",
        ttl: "43200s", // 12h — stale IPO alerts are useless
        notification: {
          channel_id: msg.channelId,
          sound: "default",
          default_vibrate_timings: true,
          notification_priority: "PRIORITY_HIGH",
          visibility: "PUBLIC",
        },
      },
      data: {
        // flat keys for system-displayed notifications (tap → intent extras), plus Expo's JSON `body`
        ...msg.data,
        title: msg.title,
        message: msg.body,
        body: JSON.stringify({ ...msg.data, title: msg.title, body: msg.body }),
        channelId: msg.channelId,
        ...(msg.imageUrl ? { image: msg.imageUrl } : {}),
      },
    },
  };
}

export async function sendToTokens(tokens: string[], msg: PushMessage): Promise<SendOutcome[]> {
  if (tokens.length === 0) return [];
  const account = serviceAccount();
  const accessToken = await getAccessToken(account, FCM_SCOPE);
  const project = account.project_id;
  if (!project) throw new Error("Service account JSON has no project_id");
  const url = `https://fcm.googleapis.com/v1/projects/${project}/messages:send`;

  return await pool(tokens, 25, async (token): Promise<SendOutcome> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildFcmMessage(token, msg)),
        });
        if (res.ok) {
          const j = (await res.json()) as { name: string };
          return { token, ok: true, messageId: j.name };
        }
        const text = await res.text();
        const invalid = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(text);
        if (invalid) return { token, ok: false, invalidToken: true, error: text.slice(0, 300) };
        if ((res.status === 429 || res.status >= 500) && attempt === 1) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        return { token, ok: false, invalidToken: false, error: `${res.status} ${text.slice(0, 300)}` };
      } catch (e) {
        if (attempt === 2) return { token, ok: false, invalidToken: false, error: String(e) };
      }
    }
    return { token, ok: false, invalidToken: false, error: "unreachable" };
  });
}
