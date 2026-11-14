// IPO Readiness Score — 5 sections × 4 questions, 0–3 points each; same bank and bands as the website.
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { Button, Card, Screen, Text } from "@/components/ui";
import { OptionList, ScoreBar } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { READINESS_SECTIONS, readinessPayload, scoreReadiness, type ReadinessAnswers } from "@/features/business/tools";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { track, trackTool } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

const STORAGE_KEY = "ipobell.business.readiness.v1";

export default function ReadinessScreen() {
  const { colors, spacing, radius } = useTheme();
  const [answers, setAnswers] = useState<ReadinessAnswers>({});
  const [section, setSection] = useState(0);
  const [mode, setMode] = useState<"quiz" | "results">("quiz");
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as { answers?: ReadinessAnswers; section?: number; mode?: "quiz" | "results" };
          if (saved.answers) setAnswers(saved.answers);
          if (typeof saved.section === "number") setSection(Math.min(saved.section, READINESS_SECTIONS.length - 1));
          if (saved.mode === "results") setMode("results");
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, section, mode })).catch(() => undefined);
  }, [answers, section, mode, hydrated]);

  const result = useMemo(() => scoreReadiness(answers), [answers]);
  useEffect(() => {
    trackTool("readiness", "start");
  }, []);
  useEffect(() => {
    if (mode === "results" && result.answered === result.total) {
      trackTool("readiness", "complete", { percent: result.percent, score: result.scoreOutOf10, band: result.band.title, weakest: result.weakest.map((w) => w.title).join(", ") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const current = READINESS_SECTIONS[section];
  const sectionDone = current.questions.every((q) => answers[q.id] !== undefined);
  const lastSection = section === READINESS_SECTIONS.length - 1;
  const progress = Math.round((result.answered / result.total) * 100);

  const go = (i: number) => {
    setSection(i);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const restart = () => {
    track("tool_restart", { tool: "readiness" });
    setAnswers({});
    setSection(0);
    setMode("quiz");
  };

  if (mode === "results") {
    const tone = result.band.tone;
    return (
      <Screen>
        <PageHeader title="Your IPO Readiness Score" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.springify().damping(16)}>
            <Card style={{ gap: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
                <View>
                  <Text variant="overline" color="textFaint">
                    Your IPO Readiness Score
                  </Text>
                  <Text variant="display" numeric style={{ marginTop: 4 }}>
                    {result.scoreOutOf10.toFixed(1)}
                    <Text variant="h3" color="textMuted" numeric>
                      {" "}/ 10
                    </Text>
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text variant="h3" color={tone}>
                    {result.band.title}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    Timeline: {result.band.timeline}
                  </Text>
                </View>
              </View>
              <ScoreBar percent={result.percent} tone={tone} height={10} />
              <Text variant="bodySm" color="textMuted">
                {result.band.advice}
              </Text>
              <Text variant="caption" color="textFaint" numeric>
                {result.percent}% · {result.points} of {result.maxPoints} points · {result.answered} of {result.total} answered
              </Text>
            </Card>
          </Animated.View>

          <Card style={{ gap: 12 }}>
            <Text variant="h3">Score by Domain</Text>
            {result.sections.map((s) => (
              <View key={s.key} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="bodySm">{s.title}</Text>
                  <Text variant="numSm" numeric color={s.percent >= 75 ? "gain" : s.percent >= 50 ? "text" : "loss"}>
                    {s.points}/{s.max}
                  </Text>
                </View>
                <ScoreBar percent={s.percent} tone={s.percent >= 75 ? "gain" : s.percent >= 50 ? "primary" : "loss"} height={6} />
              </View>
            ))}
          </Card>

          {result.weakest.length ? (
            <Card variant="alt" style={{ gap: 8 }}>
              <Text variant="h3">Where to focus first</Text>
              {result.weakest.map((w) => (
                <View key={w.key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="flag-outline" size={16} color={colors.warning} />
                  <Text variant="bodySm" style={{ flex: 1 }}>
                    {w.title} · {w.percent}%
                  </Text>
                </View>
              ))}
              <Text variant="caption" color="textMuted">
                These are the areas merchant bankers and the exchange will question first. Our pre-IPO advisory programme is built around closing exactly these gaps.
              </Text>
            </Card>
          ) : null}

          <LeadForm
            source="readiness-tool"
            title="Get a Detailed Action Plan"
            subtitle="Our advisors can walk you through every gap in your score and build a specific 12–18 month roadmap to IPO readiness, at no cost for the first consultation."
            cta="Book a Consultation"
            readinessScore={result.scoreOutOf10}
            message={`IPO Readiness Score: ${result.scoreOutOf10.toFixed(1)}/10 (${result.percent}%, ${result.band.title})`}
            payload={{ ...readinessPayload(answers), "Section scores": result.sections.map((s) => `${s.title} ${s.points}/${s.max}`).join(" · ") }}
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button title="Review answers" variant="secondary" onPress={() => { setMode("quiz"); go(0); }} />
            <Button title="Start over" variant="ghost" onPress={restart} />
            <View style={{ flex: 1 }} />
            <Button title="Eligibility check" variant="ghost" iconRight="arrow-forward" onPress={() => router.push("/business/eligibility")} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="IPO Readiness Score" subtitle={`Section ${section + 1} of ${READINESS_SECTIONS.length} · ${current.title}`} />
      <View style={{ paddingHorizontal: spacing.lg, gap: 8 }}>
        <ScoreBar percent={progress} height={6} />
        <View style={styles.steps}>
          {READINESS_SECTIONS.map((s, i) => {
            const done = s.questions.every((q) => answers[q.id] !== undefined);
            const active = i === section;
            return (
              <Text key={s.key} variant="caption" color={active ? "text" : done ? "gain" : "textFaint"} weight={active ? "semibold" : undefined} onPress={() => go(i)} style={{ flex: 1, textAlign: "center" }}>
                {s.short}
              </Text>
            );
          })}
        </View>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.xl }}>
        {current.questions.map((q, qi) => (
          <Animated.View key={q.id} entering={FadeIn.delay(qi * 40)} style={{ gap: 10 }}>
            <Text variant="title">
              <Text variant="title" color="primary">
                {section * 4 + qi + 1}.{" "}
              </Text>
              {q.text}
            </Text>
            <OptionList options={q.options.map((o) => ({ value: o.score, label: o.label }))} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} compact />
          </Animated.View>
        ))}
        <Text variant="caption" color="textFaint">
          Answers stay on this device until you choose to send them. Score bands: 90%+ ready · 75–89% almost · 55–74% getting ready · 35–54% foundation · below 35% early.
        </Text>
      </ScrollView>
      <View style={[styles.footer, { paddingHorizontal: spacing.lg, borderTopColor: colors.border, backgroundColor: colors.background, borderRadius: radius.sm }]}>
        {section > 0 ? <Button title="Back" variant="secondary" onPress={() => go(section - 1)} /> : <View />}
        {lastSection ? (
          <Button title="See my score" iconRight="arrow-forward" variant="dark" disabled={!sectionDone} onPress={() => setMode("results")} />
        ) : (
          <Button title="Next section" iconRight="arrow-forward" variant="dark" disabled={!sectionDone} onPress={() => go(section + 1)} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: "row", justifyContent: "space-between" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
