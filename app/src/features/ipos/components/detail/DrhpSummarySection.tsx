// DRHP summary on the IPO page: the one-page summary, a longer one behind "Read the full summary", where the
// money goes, the risks the document states, and the document itself. Written by the team in the admin panel
// from the uploaded offer document and shown only once published. Page references open the PDF at that page.
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { PressableScale, Section, Text } from "@/components/ui";
import { useDrhpSummary, useUploadedDocuments } from "@/features/ipos/hooks";
import { DOC_TITLE, documentUrl, referenceDocument, sortDocuments, splitPageRefs, summaryBlocks, type UploadedDocument } from "@/features/ipos/summary";
import type { Ipo } from "@/features/ipos/types";
import { openExternal, track } from "@/lib/analytics";
import { env } from "@/lib/env";
import { useTheme } from "@/lib/theme/ThemeProvider";

/** A paragraph whose "(p. 87)" references open the document at that page. */
function Paragraph({ text, doc, muted }: { text: string; doc: UploadedDocument | null; muted?: boolean }) {
  return (
    <Text variant="bodySm" color={muted ? "textMuted" : "text"} style={{ lineHeight: 21 }}>
      {splitPageRefs(text).map((part, i) =>
        part.kind === "page" && doc ? (
          <Text key={i} variant="bodySm" color="brand" onPress={() => openExternal(documentUrl(env.supabaseUrl, doc, part.page), `Offer document page ${part.page}`)} accessibilityRole="link" accessibilityLabel={`Open the document at page ${part.page}`}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

function PageLink({ page, doc }: { page: number | null; doc: UploadedDocument | null }) {
  if (!page) return null;
  if (!doc) {
    return (
      <Text variant="caption" color="textFaint" numeric>
        p. {page}
      </Text>
    );
  }
  return (
    <Pressable onPress={() => openExternal(documentUrl(env.supabaseUrl, doc, page), `Offer document page ${page}`)} hitSlop={8} accessibilityRole="link" accessibilityLabel={`Open the document at page ${page}`}>
      <Text variant="caption" color="brand" numeric>
        p. {page}
      </Text>
    </Pressable>
  );
}

export function DrhpSummarySection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const summary = useDrhpSummary(ipo.id).data ?? null;
  const documents = sortDocuments(useUploadedDocuments(ipo.id).data ?? []);
  const [expanded, setExpanded] = useState(false);
  if (!summary && documents.length === 0) return null;

  const ref = referenceDocument(summary, documents);
  const sourceName = ref ? (ref.docType === "drhp" ? "DRHP" : ref.docType === "rhp" ? "RHP" : "prospectus") : "offer document";
  const longBlocks = summaryBlocks(summary?.longText);

  return (
    <Section title={summary ? `What the ${sourceName} says` : "Offer documents"} subtitle={summary ? "Summary by the Be IPO Ready team" : undefined}>
      {summary ? (
        <View style={{ gap: 10 }}>
          {summaryBlocks(summary.shortText).map((b, i) =>
            b.kind === "heading" ? (
              <Text key={i} variant="title" style={{ marginTop: i ? 4 : 0 }}>
                {b.text}
              </Text>
            ) : (
              <Paragraph key={i} text={b.text} doc={ref} />
            ),
          )}

          {summary.useOfFunds.length ? (
            <View style={{ marginTop: 6 }}>
              <Text variant="title">Where the money goes</Text>
              <View style={[styles.list, { borderTopColor: colors.border }]}>
                {summary.useOfFunds.map((f, i) => (
                  <View key={i} style={[styles.row, { borderBottomColor: colors.border }]}>
                    <Text variant="bodySm" style={{ flex: 1 }}>
                      {f.purpose}
                    </Text>
                    {f.amount ? (
                      <Text variant="numSm" numeric>
                        {f.amount}
                      </Text>
                    ) : null}
                    <PageLink page={f.page} doc={ref} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {summary.risks.length ? (
            <View style={{ marginTop: 6 }}>
              <Text variant="title">Risks the document states</Text>
              <View style={{ gap: 10, marginTop: 8 }}>
                {summary.risks.map((r, i) => (
                  <View key={i} style={styles.risk}>
                    <Ionicons name="alert-circle-outline" size={15} color={colors.textMuted} style={{ marginTop: 2 }} />
                    <Text variant="bodySm" style={{ flex: 1 }}>
                      {r.text}
                    </Text>
                    <PageLink page={r.page} doc={ref} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {longBlocks.length ? (
            <View style={{ marginTop: 4, gap: 10 }}>
              {expanded
                ? longBlocks.map((b, i) =>
                    b.kind === "heading" ? (
                      <Text key={i} variant="title" style={{ marginTop: 6 }}>
                        {b.text}
                      </Text>
                    ) : (
                      <Paragraph key={i} text={b.text} doc={ref} muted />
                    ),
                  )
                : null}
              <Pressable
                onPress={() => {
                  if (!expanded) track("drhp_summary_expand", { slug: ipo.slug });
                  setExpanded((e) => !e);
                }}
                accessibilityRole="button"
                style={styles.more}
              >
                <Text variant="label" color="brand">
                  {expanded ? "Show less" : "Read the full summary"}
                </Text>
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.brand} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {documents.length ? (
        <View style={{ marginTop: summary ? 14 : 0 }}>
          {documents.map((d, i) => (
            <PressableScale key={d.id} onPress={() => openExternal(documentUrl(env.supabaseUrl, d), DOC_TITLE[d.docType])} accessibilityRole="link" style={[styles.doc, { borderTopColor: colors.border }, i === 0 && summary ? { borderTopWidth: StyleSheet.hairlineWidth } : null, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth } : null]}>
              <Ionicons name="document-text-outline" size={18} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text variant="bodySm">{DOC_TITLE[d.docType]}</Text>
                <Text variant="caption" color="textFaint">
                  {d.pageCount ? `PDF · ${d.pageCount} pages` : "PDF"}
                </Text>
              </View>
              <Ionicons name="open-outline" size={15} color={colors.textFaint} />
            </PressableScale>
          ))}
        </View>
      ) : null}

      {summary ? (
        <Text variant="caption" color="textFaint" style={{ marginTop: 12, lineHeight: 17 }}>
          {`A summary written by our team from the company's ${sourceName}${ref ? "; tap a page number to check it in the document" : ""}. It describes the document and is not advice. Read the offer document before you decide.`}
        </Text>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  risk: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  more: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 4 },
  doc: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
});
