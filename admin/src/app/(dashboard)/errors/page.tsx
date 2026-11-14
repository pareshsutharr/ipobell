import { Badge, Card, EmptyState, ErrorBanner, PageHeader } from "@/components/ui";
import { dateTime, daysAgo } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "App errors" };

interface ErrorGroup {
  fingerprint: string;
  message: string;
  kind: string;
  occurrences: number;
  users: number;
  fatal_count: number;
  first_seen: string;
  last_seen: string;
  versions: string[] | null;
  last_screen: string | null;
  sample_stack: string | null;
}

const RANGES = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

const KIND_LABEL: Record<string, string> = { uncaught: "Uncaught", render: "Screen failed", handled: "Handled", error: "Error" };

export default async function ErrorsPage({ searchParams }: PageProps<"/errors">) {
  const sp = await searchParams;
  const days = RANGES.some((r) => String(r.days) === sp.days) ? Number(sp.days) : 7;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("app_error_groups", { p_since: daysAgo(days), p_limit: 200 });
  const groups = (data ?? []) as ErrorGroup[];
  const total = groups.reduce((n, g) => n + Number(g.occurrences), 0);
  const fatal = groups.reduce((n, g) => n + Number(g.fatal_count), 0);
  // The function does not exist until the migration is applied; say so instead of showing a raw database message.
  const notInstalled = error && /app_error_groups|schema cache|does not exist/i.test(error.message);

  return (
    <>
      <PageHeader
        title="App errors"
        subtitle="JavaScript errors reported by the mobile app, grouped so one bug is one line."
        actions={
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <a key={r.days} href={`/errors?days=${r.days}`} className={`h-8 px-3 inline-flex items-center rounded-[10px] text-[13px] border ${r.days === days ? "bg-navy text-white border-navy" : "bg-white text-ink-2 border-line-strong hover:border-ink-3"}`}>
                {r.label}
              </a>
            ))}
          </div>
        }
      />
      <ErrorBanner message={notInstalled ? "Error reporting is not set up in the database yet. Apply the migration 20261114000400_app_errors.sql." : (error?.message ?? null)} />

      {!error ? (
        <p className="text-ink-3 text-[13px] mb-4">
          {groups.length} distinct {groups.length === 1 ? "error" : "errors"}, {total} {total === 1 ? "report" : "reports"}, {fatal} that stopped a screen or the app. Crashes in native code before the app starts are not shown here.
        </p>
      ) : null}

      <Card padded={false}>
        {groups.length === 0 ? (
          <EmptyState title="No errors reported" message={`Nothing in the last ${RANGES.find((r) => r.days === days)?.label}.`} />
        ) : (
          <ul className="divide-y divide-line">
            {groups.map((g) => (
              <li key={g.fingerprint} className="px-5 py-4">
                <details>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{g.message}</p>
                        <p className="text-ink-3 text-[12.5px] mt-1">
                          Last seen {dateTime(g.last_seen)} · first {dateTime(g.first_seen)}
                          {g.last_screen ? ` · on ${g.last_screen}` : ""}
                          {g.versions?.length ? ` · app ${g.versions.slice(0, 3).join(", ")}${g.versions.length > 3 ? "…" : ""}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {Number(g.fatal_count) > 0 ? <Badge tone="red">Stopped the screen</Badge> : null}
                        <Badge tone="neutral">{KIND_LABEL[g.kind] ?? g.kind}</Badge>
                        <Badge tone="navy">
                          {g.occurrences}× · {g.users} {Number(g.users) === 1 ? "person" : "people"}
                        </Badge>
                      </div>
                    </div>
                  </summary>
                  <pre className="mt-3 text-[12px] leading-relaxed bg-[#f6f4ee] border border-line rounded-[10px] p-3 overflow-x-auto whitespace-pre-wrap break-words">{g.sample_stack || "No stack trace was reported."}</pre>
                  <p className="text-ink-3 text-[11.5px] mt-2">Reference {g.fingerprint}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
