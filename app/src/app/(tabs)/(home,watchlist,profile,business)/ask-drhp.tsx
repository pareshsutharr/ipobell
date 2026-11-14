// Ask the offer document: a question box for one IPO. Answers come only from the uploaded DRHP / RHP and name the
// pages they came from; tapping a page opens the PDF there. Open with /ask-drhp?slug=<ipo slug>.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Button, EmptyState, FilterChip, PressableScale, Screen, Text } from "@/components/ui";
import { AskError, askDrhp } from "@/features/ipos/api";
import { checkQuestion, MAX_QUESTION_CHARS, remainingLabel, SUGGESTED_QUESTIONS, type ChatMessage } from "@/features/ipos/ask";
import { useIpo, useUploadedDocuments } from "@/features/ipos/hooks";
import { DOC_TITLE, documentUrl } from "@/features/ipos/summary";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { openExternal, track } from "@/lib/analytics";
import { env } from "@/lib/env";
import { useTheme } from "@/lib/theme/ThemeProvider";

const DEFAULT_DISCLAIMER = "Answers are taken from the company's offer document and may be incomplete. This is information, not investment advice. Check the page cited before relying on it.";
let nextId = 0;
const newId = () => `m${++nextId}`;

export default function AskDrhpScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const ipo = useIpo(slug).data;
  const docs = useUploadedDocuments(ipo?.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null); // limit reached / not switched on: stop asking
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const send = useCallback(
    async (raw: string) => {
      if (!ipo || sending || blocked) return;
      const question = raw.trim();
      const problem = checkQuestion(question);
      if (problem) return;
      setText("");
      setSending(true);
      setMessages((m) => [...m, { id: newId(), role: "user", text: question }]);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
      try {
        const result = await askDrhp(ipo.id, question);
        track("drhp_question", { slug: ipo.slug, outcome: result.outcome, pages: result.pages.length, actions: result.actions.length });
        setMessages((m) => [...m, { id: newId(), role: "assistant", text: result.answer, result }]);
        if (result.remaining === 0) setBlocked("That was your last question for today. Please come back tomorrow.");
      } catch (e) {
        const err = e instanceof AskError ? e : new AskError("busy", "The answer service is busy. Please try again in a minute.");
        track("drhp_question", { slug: ipo.slug, outcome: `failed:${err.kind}` });
        setMessages((m) => [...m, { id: newId(), role: "assistant", text: err.message, failure: err.kind }]);
        if (err.kind === "limit" || err.kind === "not_configured" || err.kind === "no_document" || err.kind === "not_available") setBlocked(err.message);
      } finally {
        setSending(false);
        setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
      }
    },
    [ipo, sending, blocked],
  );

  const noDocument = Boolean(ipo) && docs.isFetched && (docs.data ?? []).length === 0;
  const last = [...messages].reverse().find((m) => m.result);
  const remaining = remainingLabel(last?.result?.remaining ?? null);
  const disclaimer = last?.result?.disclaimer ?? DEFAULT_DISCLAIMER;

  return (
    <Screen>
      <PageHeader title="Ask the offer document" subtitle={ipo ? (ipo.display_name ?? ipo.name) : undefined} />
      {noDocument ? (
        <EmptyState icon="document-text-outline" title="No document to ask yet" message="Our team has not added the DRHP or RHP for this IPO. Once it is added, you can ask questions here." />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
          <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {messages.length === 0 ? (
              <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
                <Text variant="bodySm" color="textMuted" style={{ lineHeight: 21 }}>
                  Ask what the company&apos;s offer document says. Every answer names the page it came from, so you can check it. It cannot tell you whether to apply.
                </Text>
                <Text variant="overline" color="textFaint">
                  Try asking
                </Text>
                <View style={styles.chips}>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <FilterChip key={q} label={q} onPress={() => void send(q)} />
                  ))}
                </View>
              </View>
            ) : null}

            {messages.map((m) =>
              m.role === "user" ? (
                <View key={m.id} style={[styles.bubble, styles.mine, { backgroundColor: colors.primary, borderRadius: radius.lg }]}>
                  <Text variant="bodySm" color="#FFFFFF">
                    {m.text}
                  </Text>
                </View>
              ) : (
                <View key={m.id} style={[styles.bubble, styles.theirs, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
                  {m.failure ? (
                    <View style={styles.failure}>
                      <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
                      <Text variant="bodySm" color="textMuted" style={{ flex: 1 }}>
                        {m.text}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text variant="bodySm" style={{ lineHeight: 21 }}>
                        {m.text}
                      </Text>
                      {m.result?.pages.length && m.result.document ? (
                        <View style={{ marginTop: 10, gap: 6 }}>
                          <Text variant="caption" color="textFaint">
                            From the {DOC_TITLE[m.result.document.docType]}
                          </Text>
                          <View style={styles.chips}>
                            {m.result.pages.map((p) => (
                              <PressableScale key={p} onPress={() => openExternal(documentUrl(env.supabaseUrl, { filePath: (m.result as NonNullable<ChatMessage["result"]>).document?.filePath ?? "" }, p), `Offer document page ${p}`)} accessibilityRole="link" accessibilityLabel={`Open the document at page ${p}`} style={[styles.page, { borderColor: colors.borderStrong, borderRadius: radius.pill }]}>
                                <Ionicons name="document-text-outline" size={12} color={colors.brand} />
                                <Text variant="caption" color="brand" numeric>
                                  Page {p}
                                </Text>
                              </PressableScale>
                            ))}
                          </View>
                        </View>
                      ) : null}
                      {m.result?.actions.length ? (
                        <View style={{ marginTop: 12, gap: 8 }}>
                          {m.result.actions.map((a, i) => (
                            <Button key={a.route} title={a.label} size="sm" variant={i === 0 ? "dark" : "secondary"} onPress={() => router.push(a.route as never)} />
                          ))}
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              ),
            )}

            {sending ? (
              <View style={[styles.bubble, styles.theirs, styles.failure, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text variant="bodySm" color="textMuted">
                  Reading the document…
                </Text>
              </View>
            ) : null}

            {messages.length > 0 ? (
              <Text variant="caption" color="textFaint" style={{ lineHeight: 17, marginTop: 4 }}>
                {disclaimer}
              </Text>
            ) : null}
          </ScrollView>

          <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.lg }]}>
            {blocked ? (
              <Text variant="caption" color="textMuted" style={{ paddingVertical: 12 }}>
                {blocked}
              </Text>
            ) : (
              <>
                {remaining ? (
                  <Text variant="caption" color="textFaint" style={{ paddingTop: 8 }}>
                    {remaining}
                  </Text>
                ) : null}
                <View style={styles.inputRow}>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="Ask about the business, the issue, the risks…"
                    placeholderTextColor={colors.textFaint}
                    maxLength={MAX_QUESTION_CHARS}
                    multiline
                    editable={!sending && Boolean(ipo)}
                    onSubmitEditing={() => void send(text)}
                    blurOnSubmit
                    returnKeyType="send"
                    style={[typography.body, styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radius.md }]}
                    accessibilityLabel="Your question"
                  />
                  <PressableScale onPress={() => void send(text)} disabled={sending || checkQuestion(text) !== null} accessibilityRole="button" accessibilityLabel="Send question" style={[styles.send, { backgroundColor: sending || checkQuestion(text) !== null ? colors.surfaceAlt : colors.primary, borderRadius: radius.pill }]}>
                    <Ionicons name="arrow-up" size={18} color={sending || checkQuestion(text) !== null ? colors.textFaint : "#FFFFFF"} />
                  </PressableScale>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bubble: { paddingHorizontal: 14, paddingVertical: 12, maxWidth: "92%" },
  mine: { alignSelf: "flex-end" },
  theirs: { alignSelf: "flex-start" },
  failure: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  page: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 28, borderWidth: 1 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 10 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 10 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  send: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
