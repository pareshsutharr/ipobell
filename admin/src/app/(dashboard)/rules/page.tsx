import { RulesEditor, type RulesInitial } from "@/components/rules/RulesEditor";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { checkRule, type Eligibility, type GrowthTier, type IssueCost, type IssueSize, type RuleKey, type SectorPe } from "@/lib/business-rules";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Business rules" };

const KEYS: RuleKey[] = ["sector_pe", "growth_premium", "issue_size", "issue_cost", "eligibility"];

export default async function RulesPage() {
  const { admin } = await requireAdmin();
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("business_rules").select("key, value, updated_at");

  const missingTable = error && /business_rules|schema cache/i.test(error.message);
  const rows = new Map((data ?? []).map((r) => [r.key as RuleKey, r]));
  const absent = KEYS.filter((k) => !rows.has(k));
  // A stored value the panel itself would refuse (edited by hand in the database, for example) is shown as is,
  // with the reason, so it can be corrected here.
  const invalid = KEYS.filter((k) => rows.has(k) && checkRule(k, rows.get(k)?.value) !== null);

  const initial: RulesInitial | null =
    !error && absent.length === 0
      ? {
          sector_pe: rows.get("sector_pe")?.value as SectorPe[],
          growth_premium: rows.get("growth_premium")?.value as GrowthTier[],
          issue_size: rows.get("issue_size")?.value as IssueSize,
          issue_cost: rows.get("issue_cost")?.value as IssueCost,
          eligibility: rows.get("eligibility")?.value as Eligibility,
          updatedAt: Object.fromEntries(KEYS.map((k) => [k, rows.get(k)?.updated_at as string])),
        }
      : null;

  return (
    <>
      <PageHeader title="Business rules" subtitle="The numbers behind the app's issue size, issue cost and eligibility tools. Changes reach the app without a new release." />
      <ErrorBanner
        message={
          missingTable
            ? "Business rules are not set up in the database yet. Apply the migration 20261114001000_business_rules.sql. Until then the app uses the numbers built into it."
            : (error?.message ?? (absent.length ? `These rules are missing from the database: ${absent.join(", ")}. Re-apply the migration 20261114001000_business_rules.sql.` : null))
        }
      />
      {invalid.length ? (
        <div className="rounded-[10px] border border-amber/30 bg-amber-soft px-4 py-3 text-[13px] mb-5">
          The app is ignoring {invalid.length === 1 ? "this rule" : "these rules"} and using its built-in numbers instead, because the stored value is not valid: {invalid.join(", ")}. Correct and save below.
        </div>
      ) : null}
      {initial ? <RulesEditor initial={initial} canWrite={admin.role === "super_admin"} /> : null}
    </>
  );
}
