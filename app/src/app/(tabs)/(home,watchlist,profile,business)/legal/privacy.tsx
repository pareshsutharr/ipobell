import React from "react";

import { TextPage } from "@/features/shell/components/TextPage";
import { env } from "@/lib/env";

export default function PrivacyScreen() {
  return (
    <TextPage
      title="Privacy policy"
      subtitle="Last updated 16 November 2026"
      blocks={[
        {
          paragraphs: [
            "Be IPO Ready (\"we\", \"us\") provides information about initial public offerings in India and tools for business owners who are thinking about listing. This policy explains what data the app collects, why, and how you can control it. By using Be IPO Ready you agree to this policy.",
          ],
        },
        {
          heading: "What we collect",
          bullets: [
            "Account: you can sign in with Google or with e-mail and password, or continue as a guest. A guest gets an anonymous account ID so the watchlist and alert preferences can be saved. If you sign in we also store your e-mail address and, with Google, your name and profile picture.",
            "How you use the app: whether you chose Investor or Business owner, and usage events such as screens opened, IPOs viewed, searches, tools started and their results, and links tapped. These are stored with your account ID and a random device ID.",
            "Push token: a Firebase Cloud Messaging (FCM) device token, used only to deliver the notifications you opt in to.",
            "Device details: device model, platform and app version, stored alongside the push token to help troubleshoot delivery.",
            "Your choices: the IPOs you add to your watchlist, your notification preferences and your theme preference.",
            "PAN numbers you choose to save for allotment checks: stored encrypted on our servers and sent to the IPO's registrar (for example MUFG Intime or Bigshare) only to check allotment status for IPOs you add. Never sold. Deleted when you remove them or delete your account. We never collect demat account or bank details.",
            "Business enquiries: when you send a tool result to our team or book a call, we receive the name, phone number, e-mail, company name and message you enter, together with your answers and results from that tool.",
            "Balance sheet check: the statements file you choose is read on your phone and nothing is uploaded. Only if you tick the box and tap Save are the file and the figures you checked stored in a private folder for your account, where our advisory team can open them to prepare for a call with you.",
            "Questions you ask about an offer document: the question, the answer and the time are stored with your account ID, to limit use per person and to improve the answers.",
            "Error reports: if the app fails, a technical report (error text, screen, app version) is sent so we can fix it. PANs, e-mail addresses and phone numbers are removed from the report before it leaves your phone.",
          ],
        },
        {
          heading: "How we use it",
          bullets: [
            "To show your watchlist and send the alerts you chose (new IPOs, open / close reminders, allotment, listing, subscription and GMP changes).",
            "To check and tell you your allotment status for the applications you add.",
            "To contact you about an enquiry you sent. Our advisory team may call, message or e-mail you about that enquiry.",
            "To understand which screens and tools are useful and to improve the app.",
            "To keep the service reliable and fix errors.",
          ],
        },
        {
          heading: "Third parties",
          bullets: [
            "Supabase: hosts our database, authentication and server functions.",
            "Firebase Cloud Messaging (Google): delivers push notifications to your device.",
            "Google: sign-in, if you choose it.",
            "IPO registrars: receive a PAN you saved, only to look up allotment status.",
            "Our website and e-mail provider: carry the enquiries you send to our advisory team.",
            "Google Gemini: when you ask a question about an offer document, your question and pages of that public document are sent to Google's Gemini service to write the answer. Your name, e-mail, phone number and PAN are not sent.",
            "IPO Guru (ipoguru.in): the source of IPO, GMP and subscription data. No personal data is sent to IPO Guru.",
          ],
        },
        {
          heading: "What we don't do",
          bullets: ["We do not sell your data.", "We do not share your watchlist, preferences or usage with advertisers.", "We do not contact you unless you sent us an enquiry or turned on notifications."],
        },
        {
          heading: "Retention",
          bullets: [
            "Push tokens that haven't been seen for 180 days are deleted automatically.",
            "Notification logs are kept for 180 days for de-duplication and troubleshooting.",
            "Usage events are kept for up to 18 months. Error reports are kept for 90 days. Questions about offer documents are kept for one year.",
            "Balance sheet files and figures you saved are deleted automatically after 90 days.",
            "Guest accounts that were never used are removed after 90 days.",
            "Account data is kept until you delete your account.",
            "Business enquiries are kept as business records so our team can follow up.",
          ],
        },
        {
          heading: "Your controls",
          bullets: [
            "Delete your account at any time from Profile → Delete my data. This erases your account, watchlist, preferences, push tokens, saved PANs, tracked applications and saved balance sheet files immediately.",
            "After deletion, enquiries you sent stay with our advisory team, and past usage events, error reports and questions remain without any link to your account. To have an enquiry removed, contact us.",
            "Turn individual alerts on or off from the notification settings, or block notifications in system settings.",
            "Remove a saved PAN at any time from Saved PANs.",
            "Delete a saved balance sheet file and its figures at any time from Get Listed → Balance Sheet Check.",
          ],
        },
        {
          heading: "Children",
          paragraphs: ["Be IPO Ready is intended for adults (18+) who can legally invest in Indian securities. We do not knowingly collect data from children."],
        },
        {
          heading: "Changes & contact",
          paragraphs: [`We may update this policy; the date above reflects the latest version. Questions or requests: ${env.links.contact.replace("https://", "")} or ${env.brand.phone}.`],
        },
      ]}
      links={[
        { label: "Contact us", url: env.links.contact },
        { label: "Call us", url: env.links.support },
      ]}
    />
  );
}
