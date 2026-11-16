// Balance sheet check: choose a statements file (read on the phone) or type the figures, check them, and see
// ratios and SME rule checks. Saving the file and figures to the account is optional and needs consent.
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { Button, Card, KeyValueRow, PressableScale, Screen, SegmentedControl, Text } from "@/components/ui";
import { CheckRow, Field, NumberField, PillChoice } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { buildHealthReport, countFigures, emptyYear, FIGURE_KEYS, FIGURE_LABELS, formatRatio, healthMessage, healthPayload, MAX_YEARS, type FigureKey, type YearFigures } from "@/features/business/health";
import { deleteReport, fetchSavedReports, SaveError, saveReport } from "@/features/business/healthApi";
import { PickError, pickStatementsFile, type PickedFile } from "@/features/business/healthPick";
import { BALANCE_SHEET_CONSENT, BALANCE_SHEET_CONSENT_CHECKBOX, BALANCE_SHEET_CONSENT_TITLE, daysLeft, fileSizeLabel, HEALTH_DISCLAIMER, READ_ON_PHONE_NOTE, SAVE_FAILURE_TEXT, type SavedReport } from "@/features/business/healthSaved";
import { parseStatements, toCrore, UNIT_KEYS, UNITS, type ParsedStatements, type UnitKey } from "@/features/business/sheetParse";
import { readSheets, SheetReadError } from "@/features/business/sheetRead";
import { useBusinessRules } from "@/features/business/useBusinessRules";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { trackTool } from "@/lib/analytics";
import { useAuth } from "@/lib/auth/store";
import { dateLong } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

type Step = "start" | "review" | "report";
const TYPED_LABELS = ["Latest year", "Previous year", "Two years ago"];
const CAN_BE_NEGATIVE: ReadonlySet<FigureKey> = new Set(["ebitda", "pat", "netWorth"]);

const textsOf = (years: YearFigures[]): Record<string, string> => {
  const out: Record<string, string> = {};
  years.forEach((y, i) => FIGURE_KEYS.forEach((k) => (out[`${i}:${k}`] = y[k] === null ? "" : String(y[k]))));
  return out;
};

export default function HealthCheckScreen() {
  const { colors, spacing, radius } = useTheme();
  const rules = useBusinessRules();
  const userId = useAuth((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("start");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedStatements | null>(null);
  const [unit, setUnit] = useState<UnitKey | null>(null);
  const [source, setSource] = useState<"file" | "typed">("typed");
  const [years, setYears] = useState<YearFigures[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [yearIndex, setYearIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedReport | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const savedQuery = useQuery({ queryKey: ["balance-sheet-reports", userId], queryFn: fetchSavedReports, enabled: Boolean(userId), staleTime: 60_000 });
  const savedList = savedQuery.data ?? [];

  const report = useMemo(() => buildHealthReport(years, rules.eligibility), [years, rules.eligibility]);
  const figureCount = countFigures(years);

  useEffect(() => {
    trackTool("health_check", "start");
  }, []);

  const load = (next: YearFigures[], from: "file" | "typed") => {
    setYears(next);
    setTexts(textsOf(next));
    setSource(from);
    setYearIndex(0);
  };

  const startTyping = () => {
    setFile(null);
    setParsed(null);
    setUnit(null);
    setSaved(null);
    setNotice(null);
    load([emptyYear(TYPED_LABELS[0])], "typed");
    setStep("review");
  };

  const chooseFile = async () => {
    setNotice(null);
    setBusy(true);
    try {
      const picked = await pickStatementsFile();
      if (!picked) return;
      setFile(picked);
      setSaved(null);
      setConsent(false);
      setSaveMessage(null);
      if (picked.kind === "pdf") {
        setParsed(null);
        setUnit(null);
        load([emptyYear(TYPED_LABELS[0])], "typed");
        setNotice("Figures cannot be read from a PDF. Please type them from your statements below.");
      } else {
        const result = parseStatements(readSheets(picked.bytes, picked.kind));
        setParsed(result);
        setUnit(result.unit);
        if (result.found === 0) {
          load([emptyYear(TYPED_LABELS[0])], "typed");
          setNotice("No figures could be read from this file. It may not have year headings or the usual row names. Please type the figures below.");
        } else {
          load(result.unit ? toCrore(result.years, result.unit) : result.years.map((y) => emptyYear(y.label)), "file");
        }
      }
      setStep("review");
    } catch (e) {
      setNotice(e instanceof PickError || e instanceof SheetReadError ? e.message : "The file could not be opened. Please try again or type the figures in.");
    } finally {
      setBusy(false);
    }
  };

  const changeUnit = (u: UnitKey) => {
    setUnit(u);
    if (parsed?.found) load(toCrore(parsed.years, u), "file");
  };

  const setFigure = (i: number, key: FigureKey, text: string, n: number | null) => {
    setTexts((t) => ({ ...t, [`${i}:${key}`]: text }));
    setYears((ys) => ys.map((y, idx) => (idx === i ? { ...y, [key]: n } : y)));
  };

  const addYear = () => {
    if (years.length >= MAX_YEARS) return;
    const next = [...years, emptyYear(TYPED_LABELS[years.length])];
    setYears(next);
    setTexts((t) => ({ ...t, ...Object.fromEntries(FIGURE_KEYS.map((k) => [`${next.length - 1}:${k}`, ""])) }));
    setYearIndex(next.length - 1);
  };

  const showReport = () => {
    setStep("report");
    // counts only: the amounts themselves are never sent as usage data
    trackTool("health_check", "complete", { source, years: years.length, figures: figureCount, checks_met: report.met, checks_not_met: report.notMet });
  };

  const save = async () => {
    if (!file || !userId || !consent) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const row = await saveReport({ userId, bytes: file.bytes, fileName: file.name, kind: file.kind, figures: years, figuresSource: source });
      setSaved(row);
      void queryClient.invalidateQueries({ queryKey: ["balance-sheet-reports", userId] });
    } catch (e) {
      setSaveMessage(SAVE_FAILURE_TEXT[e instanceof SaveError ? e.reason : "failed"]);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (r: SavedReport) => {
    Alert.alert("Delete this report?", `"${r.fileName}" and its figures will be removed from our servers. This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteReport(r)
            .then(() => {
              if (saved?.id === r.id) setSaved(null);
              void queryClient.invalidateQueries({ queryKey: ["balance-sheet-reports", userId] });
            })
            .catch((e: unknown) => Alert.alert("Could not delete", SAVE_FAILURE_TEXT[e instanceof SaveError ? e.reason : "failed"]));
        },
      },
    ]);
  };

  const openSaved = (r: SavedReport) => {
    setFile(null);
    setParsed(null);
    setUnit(null);
    setSaved(r);
    setNotice(null);
    load(r.figures.length ? r.figures : [emptyYear(TYPED_LABELS[0])], r.figuresSource);
    setStep("report");
  };

  const year = years[yearIndex];
  const needsUnit = source === "file" && parsed !== null && parsed.found > 0 && unit === null;

  return (
    <Screen>
      <PageHeader title="Balance sheet check" subtitle="Your ratios against the SME listing limits" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        {step === "start" ? (
          <>
            <Card variant="primary" style={{ gap: 8 }}>
              <Text variant="title">How it works</Text>
              <Text variant="bodySm" color="textMuted">
                Choose your financial statements as an Excel or CSV file and the app picks out revenue, profit, net worth, borrowings and a few more lines. You check the figures, then see eight ratios and how the figures compare with the SME listing limits.
              </Text>
              <View style={styles.noteRow}>
                <Ionicons name="phone-portrait-outline" size={16} color={colors.textMuted} />
                <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                  {READ_ON_PHONE_NOTE}
                </Text>
              </View>
            </Card>

            <View style={{ gap: 10 }}>
              <Button title="Choose a file" icon="document-attach-outline" onPress={chooseFile} loading={busy} fullWidth testID="health-choose-file" />
              <Button title="Type the figures instead" icon="create-outline" variant="secondary" onPress={startTyping} fullWidth testID="health-type" />
              <Text variant="caption" color="textFaint" align="center">
                Excel (.xlsx, .xls) or CSV, up to 10 MB. A PDF can be attached, but its figures have to be typed.
              </Text>
            </View>

            {notice ? (
              <Card variant="alt">
                <Text variant="bodySm" color="loss">
                  {notice}
                </Text>
              </Card>
            ) : null}

            {savedList.length ? (
              <View style={{ gap: 8 }}>
                <Text variant="overline" color="textFaint">
                  Saved reports
                </Text>
                {savedList.map((r) => (
                  <Card key={r.id} padding={12} style={styles.savedRow}>
                    <PressableScale onPress={() => openSaved(r)} accessibilityRole="button" accessibilityLabel={`Open ${r.fileName}`} style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="title" numberOfLines={1}>
                        {r.fileName}
                      </Text>
                      <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                        Saved {dateLong(r.createdAt)} · {fileSizeLabel(r.fileSize)} · deleted in {daysLeft(r.expiresAt)} days
                      </Text>
                    </PressableScale>
                    <PressableScale onPress={() => confirmDelete(r)} accessibilityRole="button" accessibilityLabel={`Delete ${r.fileName}`} style={styles.iconHit}>
                      <Ionicons name="trash-outline" size={20} color={colors.loss} />
                    </PressableScale>
                  </Card>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {step === "review" && year ? (
          <>
            {file ? (
              <Card padding={12} style={styles.savedRow}>
                <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="title" numberOfLines={1}>
                    {file.name}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {fileSizeLabel(file.bytes.byteLength)}
                    {parsed?.found ? ` · ${parsed.found} figures read` : ""}
                  </Text>
                </View>
              </Card>
            ) : null}

            {notice ? (
              <Card variant="alt">
                <Text variant="bodySm">{notice}</Text>
              </Card>
            ) : null}

            {source === "file" && parsed?.found ? (
              <Field label="Unit used in the file" hint={parsed.unit ? `The file says ${UNITS[parsed.unit].label}. Change it only if that is wrong.` : "The file does not say which unit it uses. Choose one to continue."} required={!parsed.unit}>
                <PillChoice options={UNIT_KEYS.map((u) => ({ value: u, label: UNITS[u].label }))} value={unit} onChange={changeUnit} />
              </Field>
            ) : null}

            {needsUnit ? null : (
              <>
                {years.length > 1 ? <SegmentedControl options={years.map((y, i) => ({ value: String(i), label: y.label || TYPED_LABELS[i] }))} value={String(yearIndex)} onChange={(v) => setYearIndex(Number(v))} /> : null}
                <Text variant="bodySm" color="textMuted">
                  {source === "file" ? "Check every figure against your statements and correct anything that is wrong. " : ""}All amounts in ₹ crore. Leave a box empty if you do not have the figure; it will be shown as not specified.
                </Text>
                <View style={{ gap: spacing.lg }}>
                  {FIGURE_KEYS.map((k) => {
                    const src = yearIndex === 0 && source === "file" ? parsed?.sources[k] : undefined;
                    const hint = src ? `From “${src.label}” in sheet “${src.sheet}”${src.derived ? ` (${src.derived.toLowerCase()})` : ""}` : FIGURE_LABELS[k].hint;
                    return (
                      <Field key={`${yearIndex}:${k}`} label={FIGURE_LABELS[k].label} hint={hint}>
                        <NumberField testID={`health-${k}`} value={texts[`${yearIndex}:${k}`] ?? ""} onChange={(t, n) => setFigure(yearIndex, k, t, n)} placeholder="Not specified" allowNegative={CAN_BE_NEGATIVE.has(k)} />
                      </Field>
                    );
                  })}
                </View>
                {source === "typed" && years.length < MAX_YEARS ? <Button title={`Add ${TYPED_LABELS[years.length].toLowerCase()}`} icon="add" variant="secondary" onPress={addYear} /> : null}
                <Button title="Show the report" icon="analytics-outline" onPress={showReport} disabled={figureCount === 0} fullWidth testID="health-show-report" />
              </>
            )}
            <Button title="Start again" variant="ghost" onPress={() => setStep("start")} />
          </>
        ) : null}

        {step === "report" ? (
          <>
            <Card variant="primary" style={{ gap: 6 }}>
              <Text variant="overline" color="textFaint">
                SME rule checks{report.year ? ` · ${report.year}` : ""}
              </Text>
              <Text variant="display" numeric>
                {report.met} of {report.checks.length} met
              </Text>
              <Text variant="bodySm" color="textMuted">
                {report.notMet} not met · {report.unknown} not specified. Based on {figureCount} figures {source === "file" ? "read from your file and checked by you" : "typed by you"}.
              </Text>
            </Card>

            {report.warnings.length ? (
              <Card variant="alt" style={{ gap: 6 }}>
                <Text variant="title">Please check</Text>
                {report.warnings.map((w) => (
                  <Text key={w} variant="bodySm" color="loss">
                    {w}
                  </Text>
                ))}
              </Card>
            ) : null}

            <View style={{ gap: 8 }}>
              <Text variant="overline" color="textFaint">
                Rule checks
              </Text>
              <Card padding={0} style={{ paddingHorizontal: 14 }}>
                {report.checks.map((c, i) => (
                  <CheckRow key={c.label} ok={c.ok} label={c.label} detail={c.detail} last={i === report.checks.length - 1} />
                ))}
              </Card>
            </View>

            <View style={{ gap: 8 }}>
              <Text variant="overline" color="textFaint">
                Ratios
              </Text>
              <Card padding={0} style={{ paddingHorizontal: 16 }}>
                {report.ratios.map((r, i) => (
                  <KeyValueRow key={r.key} label={r.label} value={formatRatio(r)} valueColor={r.value === null ? colors.textFaint : undefined} last={i === report.ratios.length - 1} />
                ))}
              </Card>
              <Text variant="caption" color="textFaint">
                {HEALTH_DISCLAIMER}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Edit figures" icon="create-outline" variant="secondary" onPress={() => setStep("review")} />
              <Button title="Full eligibility check" icon="git-compare-outline" variant="secondary" onPress={() => router.push("/business/eligibility")} />
            </View>

            {saved ? (
              <Card style={{ gap: 8 }}>
                <View style={styles.noteRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.gain} />
                  <Text variant="title" style={{ flex: 1 }}>
                    Saved to your account
                  </Text>
                </View>
                <Text variant="bodySm" color="textMuted">
                  “{saved.fileName}” and these figures are stored privately and will be deleted automatically on {dateLong(saved.expiresAt)}.
                </Text>
                <Button title="Delete now" icon="trash-outline" variant="secondary" onPress={() => confirmDelete(saved)} />
              </Card>
            ) : file && userId ? (
              <Card style={{ gap: 10 }}>
                <Text variant="title">{BALANCE_SHEET_CONSENT_TITLE}</Text>
                <Text variant="bodySm" color="textMuted">
                  Optional. Saving lets our advisor see your statements before a call.
                </Text>
                {BALANCE_SHEET_CONSENT.map((line) => (
                  <View key={line} style={styles.noteRow}>
                    <Text variant="bodySm" color="textMuted">
                      •
                    </Text>
                    <Text variant="bodySm" color="textMuted" style={{ flex: 1 }}>
                      {line}
                    </Text>
                  </View>
                ))}
                <PressableScale onPress={() => setConsent((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} testID="health-consent" style={[styles.consent, { borderColor: consent ? colors.text : colors.borderStrong, borderRadius: radius.md }]}>
                  <Ionicons name={consent ? "checkbox" : "square-outline"} size={22} color={consent ? colors.text : colors.textFaint} />
                  <Text variant="bodySm" style={{ flex: 1 }}>
                    {BALANCE_SHEET_CONSENT_CHECKBOX}
                  </Text>
                </PressableScale>
                <Button title="Save file and figures" icon="cloud-upload-outline" onPress={save} disabled={!consent} loading={saving} fullWidth testID="health-save" />
                {saveMessage ? (
                  <Text variant="bodySm" color="loss">
                    {saveMessage}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            <LeadForm
              source="balance-sheet-check"
              title="Go through this with an advisor"
              subtitle="Our team reads the full statements, restates them the way a DRHP needs and tells you what to fix before filing."
              cta="Request a call back"
              message={healthMessage(report)}
              payload={{ ...healthPayload(years, report, source), "Saved report": saved ? saved.id : "Not saved" }}
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconHit: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  consent: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1 },
});
