// node --test supabase/tests/registrars.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bestMatch, nameScore, normalizeName, num, manualUrlFor, AUTO_DRIVERS } from "../functions/_shared/registrars.ts";

test("normalizeName strips corporate suffixes and noise", () => {
  assert.deepEqual(normalizeName("Paras Healthcare Limited - IPO"), ["paras", "healthcare"]);
  assert.deepEqual(normalizeName("Ravita Engineering Services Limited - SME IPO"), ["ravita", "engineering", "services"]);
  assert.deepEqual(normalizeName("M.K.Sons Fine Jewels"), ["m", "k", "sons", "fine", "jewels"]);
});

test("bestMatch picks the registrar's spelling of our IPO name", () => {
  const list = [
    { id: "11968", name: "Paras Healthcare Limited - IPO" },
    { id: "11966", name: "Sahajanand Medical Technologies Limited -  IPO" },
    { id: "11967", name: "Bonfiglioli Transmissions Limited - IPO" },
    { id: "11965", name: "Ravita Engineering Services Limited - SME IPO" },
  ];
  assert.equal(bestMatch("Paras Healthcare", list)?.id, "11968");
  assert.equal(bestMatch("Bonfiglioli Transmissions", list)?.id, "11967");
  assert.equal(bestMatch("Sahajanand Medical Technologies", list)?.id, "11966");
  assert.equal(bestMatch("Zetwerk Manufacturing Business", list), null);
});

test("nameScore is symmetric enough and rejects weak overlaps", () => {
  assert.ok(nameScore("EAAA India Alternatives", "EAAA India Alternatives Limited - IPO") > 0.9);
  assert.ok(nameScore("Core4 Engineers", "ACME India Industries Limited") < 0.3);
});

test("num parses registrar numerics", () => {
  assert.equal(num("714"), 714);
  assert.equal(num("1,200"), 1200);
  assert.equal(num("NON-ALLOTTE"), null);
  assert.equal(num(""), null);
});

test("manualUrlFor prefers the status page", () => {
  assert.equal(manualUrlFor({ status_page: "https://a", website: "https://b" }), "https://a");
  assert.equal(manualUrlFor({ status_page: null, website: "https://b" }), "https://b");
  assert.equal(manualUrlFor(null), null);
  assert.ok(AUTO_DRIVERS.has("mufg") && AUTO_DRIVERS.has("bigshare") && !AUTO_DRIVERS.has("kfintech"));
});
