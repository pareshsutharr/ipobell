// Public page required by Google Play (Data safety → Delete account URL). No sign-in needed; see PUBLIC_PATHS in proxy.ts.
export const metadata = {
  title: { absolute: "Delete your account · Be IPO Ready" },
  description: "How to delete your Be IPO Ready account and the data linked to it.",
  robots: { index: true, follow: true },
};

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-[680px] px-5 py-12 text-[15px] leading-relaxed text-[#0F2D52]">
      <p className="text-[11px] tracking-[0.18em] uppercase opacity-60">Be IPO Ready: IPO GMP &amp; Alerts</p>
      <h1 className="mt-2 text-[30px] font-semibold leading-tight">Delete your account and data</h1>
      <p className="mt-4">
        This page explains how to delete your account in the <strong>Be IPO Ready</strong> Android app (developer: Paresh Suthar) and what happens to your data.
      </p>

      <h2 className="mt-8 text-[19px] font-semibold">Delete it in the app</h2>
      <ol className="mt-3 list-decimal space-y-1 pl-5">
        <li>Open the Be IPO Ready app.</li>
        <li>Go to the <strong>Profile</strong> tab.</li>
        <li>Scroll to the bottom and tap <strong>Delete my data</strong>.</li>
        <li>Tap <strong>Delete</strong> to confirm.</li>
      </ol>
      <p className="mt-3">Deletion happens immediately and cannot be undone.</p>

      <h2 className="mt-8 text-[19px] font-semibold">If you cannot open the app</h2>
      <p className="mt-3">
        Send a deletion request through{" "}
        <a className="underline" href="https://beipoready.com/contact-us">beipoready.com/contact-us</a> or call{" "}
        <a className="underline" href="tel:+919213020393">+91 92130 20393</a>. Tell us the e-mail address you signed in with. We delete the account within 30 days.
      </p>

      <h2 className="mt-8 text-[19px] font-semibold">What is deleted</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>Your account, name and e-mail address</li>
        <li>Your watchlist</li>
        <li>Saved PAN numbers and the IPO applications you recorded</li>
        <li>Notification settings and your device&apos;s push notification token</li>
      </ul>

      <h2 className="mt-8 text-[19px] font-semibold">What is kept</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>
          Business enquiries you sent us through the app (name, company, phone, e-mail, message) are kept, no longer linked to your account, so that we can respond to
          them. Ask us through the contact page to remove an enquiry and we will delete it within 30 days.
        </li>
        <li>Usage statistics that are no longer linked to your account.</li>
      </ul>

      <p className="mt-10 text-[13px] opacity-70">
        See also our <a className="underline" href="https://beipoready.com/privacy-policy">privacy policy</a>.
      </p>
    </main>
  );
}
