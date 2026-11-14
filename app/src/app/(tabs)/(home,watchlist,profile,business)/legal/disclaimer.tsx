import React from "react";

import { TextPage } from "@/features/shell/components/TextPage";
import { env } from "@/lib/env";

export default function DisclaimerScreen() {
  return (
    <TextPage
      title="Disclaimer"
      subtitle="Please read before relying on any data"
      blocks={[
        {
          heading: "Information only",
          paragraphs: [
            "Everything in Be IPO Ready — IPO dates, price bands, subscription figures, grey market premium (GMP), listing data, company financials and notifications — is provided for general information and educational purposes only. It is not investment advice, a recommendation, a solicitation or an offer to buy or sell any security.",
          ],
        },
        {
          heading: "Not SEBI-registered",
          paragraphs: ["Be IPO Ready and its developers are not registered with the Securities and Exchange Board of India (SEBI) as investment advisers, research analysts or intermediaries of any kind. We do not provide personalised financial advice."],
        },
        {
          heading: "GMP is unofficial",
          paragraphs: [
            "Grey market premium, Kostak and subject-to-sauda rates come from informal, unregulated markets. They are indicative only, may be inaccurate or manipulated, and do not predict the listing price. SEBI does not recognise the grey market.",
          ],
        },
        {
          heading: "No guarantees",
          bullets: [
            "Data is sourced from third parties, exchanges and registrars and may be delayed, incomplete or wrong. Always verify with the official prospectus (RHP), the exchanges (NSE / BSE) and the registrar.",
            "Notifications may be delayed or missed due to device, network or platform limitations. Do not depend on them for time-critical decisions.",
            "Past listing performance shown in the app does not indicate future results.",
          ],
        },
        {
          heading: "Your responsibility",
          paragraphs: ["Investing in IPOs involves risk, including loss of capital. Read the offer documents carefully and consult a SEBI-registered investment adviser before investing. Any decision you make is your own."],
        },
        {
          heading: "Advertising & affiliate links",
          paragraphs: ["Be IPO Ready shows ads and may include clearly labelled affiliate links to brokers. These are not endorsements. We are not responsible for the products or services of advertisers or brokers."],
        },
        {
          heading: "Limitation of liability",
          paragraphs: ["To the maximum extent permitted by law, Be IPO Ready and its developers are not liable for any loss or damage arising from the use of, or reliance on, the app or its content."],
        },
        {
          heading: "Data attribution",
          paragraphs: ["IPO, GMP, subscription and company data is provided by IPO Guru (ipoguru.in). Logos and trademarks belong to their respective owners."],
        },
      ]}
      links={[{ label: "Data by IPO Guru", url: env.links.dataAttribution }]}
    />
  );
}
