import React from "react";

import { TextPage } from "@/features/shell/components/TextPage";
import { env } from "@/lib/env";

export default function PrivacyScreen() {
  return (
    <TextPage
      title="Privacy policy"
      subtitle="Last updated 26 October 2026"
      blocks={[
        {
          paragraphs: [
            "Be IPO Ready (\"we\", \"us\") provides information about initial public offerings in India. This policy explains what data the app collects, why, and how you can control it. By using Be IPO Ready you agree to this policy.",
          ],
        },
        {
          heading: "What we collect",
          bullets: [
            "Account identifier: when you first open the app we create an anonymous account ID so your watchlist and alert preferences can be saved. If you sign in with Google we also store your Google account email, name and profile picture.",
            "Push token: a Firebase Cloud Messaging (FCM) device token, used only to deliver the notifications you opt in to.",
            "Device details: device model, platform and app version, stored alongside the push token to help troubleshoot delivery.",
            "Your choices: the IPOs you add to your watchlist, your notification preferences and your theme preference.",
            "PAN numbers you choose to save for allotment checks — stored encrypted on our servers, used only to query the registrar's public allotment-status service for IPOs you add, never shared or sold, deleted when you remove them or delete your account. We never collect demat account or bank details.",
          ],
        },
        {
          heading: "How we use it",
          bullets: [
            "To show your watchlist and send the alerts you chose (new IPOs, open / close reminders, allotment, listing, subscription and GMP changes).",
            "To keep the service reliable (aggregate, non-identifying usage of push delivery and sync jobs).",
          ],
        },
        {
          heading: "Third parties",
          bullets: [
            "Supabase — hosts our database, authentication and server functions.",
            "Firebase Cloud Messaging (Google) — delivers push notifications to your device.",
            "IPO Guru (ipoguru.in) — the source of IPO, GMP and subscription data. No personal data is sent to IPO Guru.",
          ],
        },
        {
          heading: "What we don't do",
          bullets: ["We do not sell your data.", "We do not share your watchlist or preferences with anyone.", "We do not send marketing emails."],
        },
        {
          heading: "Retention",
          bullets: [
            "Push tokens that haven't been seen for 180 days are deleted automatically.",
            "Notification logs are kept for 180 days for de-duplication and troubleshooting.",
            "Account data is kept until you delete your account.",
          ],
        },
        {
          heading: "Your controls",
          bullets: [
            "Delete your account at any time from Profile → Delete my data. This erases your account, watchlist, preferences, push tokens and purchase records immediately.",
            "Turn individual alerts on or off from More → Notifications, or block notifications in system settings.",
          ],
        },
        {
          heading: "Children",
          paragraphs: ["Be IPO Ready is intended for adults (18+) who can legally invest in Indian securities. We do not knowingly collect data from children."],
        },
        {
          heading: "Changes & contact",
          paragraphs: ["We may update this policy; the date above reflects the latest version. Questions or requests: support@ipobell.in."],
        },
      ]}
      links={[
        { label: "Email support", url: env.links.support },
      ]}
    />
  );
}
