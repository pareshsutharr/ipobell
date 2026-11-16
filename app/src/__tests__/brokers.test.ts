/// <reference types="node" />
import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

import { BROKER_PACKAGES, BROKERS, BROKERS_NOTE, monogram, openBroker, openSteps, type Broker } from "@/features/ipos/brokers";

const groww = BROKERS.find((b) => b.id === "groww")!;
const icici = BROKERS.find((b) => b.id === "icici-direct")!;

describe("broker list", () => {
  it("is in A to Z order, with unique ids and names", () => {
    const names = BROKERS.map((b) => b.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    expect(new Set(BROKERS.map((b) => b.id)).size).toBe(BROKERS.length);
    expect(new Set(names).size).toBe(BROKERS.length);
    expect(BROKERS.length).toBe(10);
  });

  it("every broker has an https page on its own site and a well-formed package or none", () => {
    for (const b of BROKERS) {
      const url = new URL(b.webUrl);
      expect(url.protocol).toBe("https:");
      expect(url.username + url.password).toBe("");
      if (b.androidPackage !== null) expect(b.androidPackage).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
      expect(b.id).toMatch(/^[a-z0-9-]+$/);
    }
    expect(new Set(BROKER_PACKAGES).size).toBe(BROKER_PACKAGES.length);
  });

  it("the Android build is allowed to see exactly these apps", () => {
    const config = fs.readFileSync(path.join(__dirname, "../../app.config.ts"), "utf8");
    const listed = config.match(/manifestQueries: \{ package: \[([^\]]+)\]/)?.[1].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) ?? [];
    expect([...listed].sort()).toEqual([...BROKER_PACKAGES].sort());
  });

  it("says plainly that we are not a broker and are not paid", () => {
    expect(BROKERS_NOTE).toMatch(/not a broker and does not place orders/);
    expect(BROKERS_NOTE).toMatch(/A to Z/);
    expect(BROKERS_NOTE).toMatch(/not paid by them/);
    for (const word of ["best", "recommend", "top", "trusted", "partner"]) expect(BROKERS_NOTE.toLowerCase()).not.toMatch(new RegExp(`\\b${word}`));
  });

  it("initials for brokers without an icon", () => {
    expect(monogram("Angel One")).toBe("AO");
    expect(monogram("Groww")).toBe("GR");
    expect(monogram("5paisa")).toBe("5P");
    expect(monogram("HDFC SKY")).toBe("HS");
    expect(monogram("  ")).toBe("?");
  });
});

describe("opening a broker", () => {
  it("tries the app first on Android, then the website", () => {
    expect(openSteps(groww, "android")).toEqual([{ kind: "app", packageName: "com.nextbillion.groww" }, { kind: "web", url: "https://groww.in/ipo" }]);
    expect(openSteps(groww, "ios")).toEqual([{ kind: "web", url: "https://groww.in/ipo" }]);
    expect(openSteps(icici, "android")).toEqual([{ kind: "web", url: "https://www.icicidirect.com/ipo" }]);
  });

  const run = async (b: Broker, platform: string, appWorks: boolean, webWorks: boolean) => {
    const calls: string[] = [];
    const how = await openBroker(b, platform, {
      app: (p) => {
        calls.push(`app:${p}`);
        if (!appWorks) throw new Error("not installed");
      },
      web: async (u) => {
        calls.push(`web:${u}`);
        if (!webWorks) throw new Error("no browser");
      },
    });
    return { how, calls };
  };

  it("app installed: opens the app and does not open the website as well", async () => {
    expect(await run(groww, "android", true, true)).toEqual({ how: "app", calls: ["app:com.nextbillion.groww"] });
  });

  it("app not installed: falls back to the website", async () => {
    expect(await run(groww, "android", false, true)).toEqual({ how: "web", calls: ["app:com.nextbillion.groww", "web:https://groww.in/ipo"] });
  });

  it("on iPhone, or with no known package, goes straight to the website", async () => {
    expect(await run(groww, "ios", true, true)).toEqual({ how: "web", calls: ["web:https://groww.in/ipo"] });
    expect(await run(icici, "android", true, true)).toEqual({ how: "web", calls: ["web:https://www.icicidirect.com/ipo"] });
  });

  it("reports failure when nothing could be opened, instead of pretending", async () => {
    expect((await run(groww, "android", false, false)).how).toBe("failed");
  });

  it("every broker ends at its own website when its app is missing", async () => {
    for (const b of BROKERS) {
      const r = await run(b, "android", false, true);
      expect(r.how).toBe("web");
      expect(r.calls[r.calls.length - 1]).toBe(`web:${b.webUrl}`);
    }
  });
});
