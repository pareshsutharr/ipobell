// "Apply through your broker" (plan step 5.4, simple version): a list of brokers; tapping one opens the broker's
// own app if it is on the phone, otherwise the broker's IPO page on the web. Pure data and decisions here;
// brokerOpen.ts does the opening.
//
// Be IPO Ready is not a broker, places no orders and has no arrangement with any of these firms. The list is
// in A to Z order so that no position means anything. Package names and web pages were checked on
// 16 Nov 2026 (Play Store listing and page both answering); a wrong or changed one just falls back to the website.

export interface Broker {
  id: string;
  name: string;
  /** Android package of the broker's trading app. null = no app is opened, only the website. */
  androidPackage: string | null;
  /** The broker's IPO page (or sign-in page). Always https. */
  webUrl: string;
}

const LIST: Broker[] = [
  { id: "5paisa", name: "5paisa", androidPackage: "com.fivepaisa.trade", webUrl: "https://www.5paisa.com/ipo" },
  { id: "angel-one", name: "Angel One", androidPackage: "com.msf.angelmobile", webUrl: "https://www.angelone.in/ipo" },
  { id: "dhan", name: "Dhan", androidPackage: "com.dhan.live", webUrl: "https://dhan.co/ipo/" },
  { id: "groww", name: "Groww", androidPackage: "com.nextbillion.groww", webUrl: "https://groww.in/ipo" },
  { id: "hdfc-sky", name: "HDFC SKY", androidPackage: "com.cloudtradetech.sky", webUrl: "https://hdfcsky.com/ipo" },
  // The Play Store id of ICICI Direct's trading app could not be confirmed, so only the website is opened.
  { id: "icici-direct", name: "ICICI Direct", androidPackage: null, webUrl: "https://www.icicidirect.com/ipo" },
  { id: "kotak-neo", name: "Kotak Neo", androidPackage: "com.kotak.neo", webUrl: "https://www.kotaksecurities.com/ipo/" },
  { id: "paytm-money", name: "Paytm Money", androidPackage: "com.paytmmoney", webUrl: "https://www.paytmmoney.com/ipo" },
  { id: "upstox", name: "Upstox", androidPackage: "in.upstox.app", webUrl: "https://upstox.com/ipo/" },
  { id: "zerodha", name: "Zerodha", androidPackage: "com.zerodha.kite3", webUrl: "https://console.zerodha.com/portfolio/ipo" },
];

/** A to Z by name, ignoring case and leading digits being "first" is fine: the order carries no meaning. */
export const BROKERS: Broker[] = [...LIST].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

/** Packages the Android build must be allowed to see (app.config.ts → manifestQueries). */
export const BROKER_PACKAGES: string[] = BROKERS.map((b) => b.androidPackage).filter((p): p is string => p !== null);

export const BROKERS_TITLE = "Apply through your broker";
export const BROKERS_NOTE =
  "Be IPO Ready is not a broker and does not place orders. Pick the broker you already have an account with: we open their app if it is on this phone, otherwise their website, and you apply there. The list is in A to Z order. We have no arrangement with these brokers and are not paid by them.";

/** One or two letters to show when the broker's app icon is not available. */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0];
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return (first[0] + words[1][0]).toUpperCase();
}

export type OpenStep = { kind: "app"; packageName: string } | { kind: "web"; url: string };

/** What to try, in order. The app is tried only on Android and only when its package is known. */
export function openSteps(broker: Broker, platform: string): OpenStep[] {
  const steps: OpenStep[] = [];
  if (platform === "android" && broker.androidPackage) steps.push({ kind: "app", packageName: broker.androidPackage });
  steps.push({ kind: "web", url: broker.webUrl });
  return steps;
}

export interface Openers {
  /** Opens the app; throws when it is not installed (or cannot be opened). */
  app: (packageName: string) => void | Promise<void>;
  /** Opens the web page; throws when nothing can open it. */
  web: (url: string) => void | Promise<void>;
}

/** Try each step until one works. Returns how the broker was opened, or "failed". */
export async function openBroker(broker: Broker, platform: string, openers: Openers): Promise<"app" | "web" | "failed"> {
  for (const step of openSteps(broker, platform)) {
    try {
      if (step.kind === "app") await openers.app(step.packageName);
      else await openers.web(step.url);
      return step.kind;
    } catch {
      // not installed, or no browser: try the next step
    }
  }
  return "failed";
}
