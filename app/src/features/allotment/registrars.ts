export interface RegistrarInfo {
  key: string;
  name: string;
  short: string;
  url: string;
  /** Substrings matched (case-insensitive) against the IPO's registrar name / driver. */
  match: string[];
}

export const REGISTRARS: RegistrarInfo[] = [
  { key: "kfintech", name: "KFin Technologies", short: "KFin", url: "https://ipostatus.kfintech.com/", match: ["kfin", "karvy"] },
  { key: "mufg", name: "MUFG Intime (Link Intime)", short: "MUFG", url: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html", match: ["mufg", "link intime", "linkintime", "intime"] },
  { key: "bigshare", name: "Bigshare Services", short: "Bigshare", url: "https://ipo.bigshareonline.com/IPO_Status.html", match: ["bigshare"] },
  { key: "cameo", name: "Cameo Corporate Services", short: "Cameo", url: "https://ipo.cameoindia.com/", match: ["cameo"] },
  { key: "maashitla", name: "Maashitla Securities", short: "Maashitla", url: "https://maashitla.com/allotment-status/public-issues", match: ["maashitla"] },
  { key: "skyline", name: "Skyline Financial Services", short: "Skyline", url: "https://www.skylinerta.com/ipo.php", match: ["skyline"] },
  { key: "purva", name: "Purva Sharegistry", short: "Purva", url: "https://www.purvashare.com/investor-service/ipo-query", match: ["purva"] },
  { key: "integrated", name: "Integrated Registry Management", short: "Integrated", url: "https://www.integratedregistry.in/", match: ["integrated"] },
  { key: "nse", name: "NSE — application status", short: "NSE", url: "https://www.nseindia.com/products/dynaContent/equities/ipos/ipo_login.jsp", match: [] },
  { key: "bse", name: "BSE — application status", short: "BSE", url: "https://www.bseindia.com/investors/appli_check.aspx", match: [] },
];

export function findRegistrar(nameOrDriver: string | null | undefined): RegistrarInfo | null {
  if (!nameOrDriver) return null;
  const s = nameOrDriver.toLowerCase();
  return REGISTRARS.find((r) => r.match.some((m) => s.includes(m))) ?? null;
}
