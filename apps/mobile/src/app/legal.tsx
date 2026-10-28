// Admin → Legal requests: record a request from law enforcement (or a referral a
// moderator escalated), place an evidence hold that keeps a copy of what a
// member posted and sent, export the copy, and close the case, which erases it.
// Off until switched on here. The app never contacts anyone; staff decide.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { staffOnly } from "@/components/staff-only";
import {
  Button,
  Chip,
  Empty,
  ErrorText,
  Field,
  Screen,
  Toggle,
} from "@/components/ui";
import { api, type LegalCase, type LegalCaseDetail } from "@/lib/api";
import { resetFeatures } from "@/lib/features";
import { useLocale } from "@/lib/i18n";
import { saveText } from "@/lib/save-file";
import { colors, radius, space, type } from "@/lib/theme";

const KINDS = [
  "preservation",
  "legal_process",
  "emergency",
  "referral",
] as const;

function Legal() {
  const { t, language } = useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [open, setOpen] = useState<LegalCaseDetail | null>(null);
  const [kind, setKind] = useState<LegalCase["kind"]>("preservation");
  const [agency, setAgency] = useState("");
  const [reference, setReference] = useState("");
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api.admin.legalSettings(),
        api.admin.legalCases(),
      ]);
      setEnabled(s.settings.enabled);
      setCases(c.cases);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (
    fn: () => Promise<LegalCaseDetail | unknown>,
    done: string | null,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (r && typeof r === "object" && "case" in r)
        setOpen(r as LegalCaseDetail);
      setNotice(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(language === "es" ? "es" : "en-US", {
      dateStyle: "medium",
    });
  const create = () =>
    run(async () => {
      const r = await api.admin.createLegalCase({
        kind,
        agency: agency.trim() || null,
        reference: reference.trim() || null,
        subject: subject.trim() || null,
        summary: summary.trim(),
      });
      setAgency("");
      setReference("");
      setSubject("");
      setSummary("");
      return r;
    }, t("legalCases.created"));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button
          small
          variant="ghost"
          label={t("common.back")}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/admin")
          }
        />
        <Text style={type.title}>{t("legalCases.title")}</Text>
        <Text style={type.body}>{t("legalCases.intro")}</Text>
        <ErrorText error={error} />
        {notice ? <Text style={type.small}>{notice}</Text> : null}
        {enabled !== null ? (
          <Toggle
            label={t("legalCases.enabled")}
            hint={t("legalCases.enabledHint")}
            value={enabled}
            onChange={(v) =>
              run(async () => {
                await api.admin.updateLegalSettings({ enabled: v });
                resetFeatures();
              }, null)
            }
          />
        ) : null}

        {enabled ? (
          <View style={styles.section}>
            <Text style={type.heading}>{t("legalCases.new")}</Text>
            <View style={styles.row}>
              {KINDS.map((k) => (
                <Chip
                  key={k}
                  radio
                  label={t(`legalCases.kind.${k}`)}
                  selected={kind === k}
                  onPress={() => setKind(k)}
                />
              ))}
            </View>
            <Field
              label={t("legalCases.agency")}
              value={agency}
              onChangeText={setAgency}
              maxLength={200}
            />
            <Field
              label={t("legalCases.reference")}
              value={reference}
              onChangeText={setReference}
              maxLength={200}
            />
            <Field
              label={t("legalCases.subject")}
              value={subject}
              onChangeText={setSubject}
              autoCapitalize="none"
              maxLength={60}
            />
            <Field
              label={t("legalCases.summary")}
              value={summary}
              onChangeText={setSummary}
              maxLength={4000}
              multiline
            />
            <Button
              label={t("legalCases.create")}
              onPress={create}
              busy={busy}
              disabled={!summary.trim()}
            />
          </View>
        ) : null}

        <Text style={type.heading}>{t("legalCases.cases")}</Text>
        {cases.length === 0 && !error ? (
          <Empty text={t("legalCases.empty")} />
        ) : null}
        {cases.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={type.small}>
              {t(`legalCases.kind.${c.kind}`)} ·{" "}
              {t(`legalCases.status.${c.status}`)} · {when(c.createdAt)}
              {c.activeHolds
                ? ` · ${t("legalCases.holding", { count: c.activeHolds })}`
                : ""}
            </Text>
            <Text style={styles.cardTitle}>
              {[c.agency, c.reference].filter(Boolean).join(" · ") ||
                t("legalCases.noAgency")}
            </Text>
            <Text style={type.body}>{c.summary}</Text>
            {c.subjectName ? (
              <Text style={type.small}>
                {t("legalCases.about", { name: c.subjectName })}
              </Text>
            ) : null}
            {open?.case.id === c.id ? (
              <CaseDetail
                detail={open}
                busy={busy}
                note={note}
                setNote={setNote}
                onNote={() =>
                  run(async () => {
                    const r = await api.admin.addLegalNote(c.id, note.trim());
                    setNote("");
                    return r;
                  }, null)
                }
                onHold={() =>
                  run(() => api.admin.placeHold(c.id), t("legalCases.held"))
                }
                onRefresh={(id) =>
                  run(
                    () => api.admin.refreshHold(id),
                    t("legalCases.refreshed"),
                  )
                }
                onRelease={(id) =>
                  run(() => api.admin.releaseHold(id), t("legalCases.released"))
                }
                onExport={(id) =>
                  run(
                    async () =>
                      saveText(
                        `evidence-hold-${id}.json`,
                        await api.admin.exportHold(id),
                        "application/json",
                        "public.json",
                      ),
                    null,
                  )
                }
                onClose={() =>
                  run(
                    () => api.admin.closeLegalCase(c.id),
                    t("legalCases.closedNotice"),
                  )
                }
                onHide={() => setOpen(null)}
              />
            ) : (
              <Button
                small
                variant="ghost"
                label={t("legalCases.open", { title: c.reference ?? c.kind })}
                onPress={() => run(() => api.admin.legalCase(c.id), null)}
              />
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function CaseDetail(p: {
  detail: LegalCaseDetail;
  busy: boolean;
  note: string;
  setNote: (s: string) => void;
  onNote: () => void;
  onHold: () => void;
  onRefresh: (id: string) => void;
  onRelease: (id: string) => void;
  onExport: (id: string) => void;
  onClose: () => void;
  onHide: () => void;
}) {
  const { t } = useLocale();
  const open = p.detail.case.status === "open";
  return (
    <View style={{ gap: space.sm }}>
      <Text style={type.heading}>{t("legalCases.holds")}</Text>
      {p.detail.holds.length === 0 ? (
        <Text style={type.small}>{t("legalCases.noHolds")}</Text>
      ) : null}
      {p.detail.holds.map((h) => (
        <View key={h.id} style={{ gap: 4 }}>
          <Text style={type.small}>
            {h.releasedAt
              ? t("legalCases.holdReleased", {
                  date: new Date(h.releasedAt).toDateString(),
                })
              : t("legalCases.holdActive", {
                  count: h.items,
                  date: new Date(h.expiresAt).toDateString(),
                })}
          </Text>
          {!h.releasedAt ? (
            <View style={styles.row}>
              <Button
                small
                variant="secondary"
                label={t("legalCases.export")}
                onPress={() => p.onExport(h.id)}
              />
              <Button
                small
                variant="ghost"
                label={t("legalCases.refresh")}
                onPress={() => p.onRefresh(h.id)}
              />
              <Button
                small
                variant="ghost"
                label={t("legalCases.release")}
                onPress={() => p.onRelease(h.id)}
              />
            </View>
          ) : null}
        </View>
      ))}
      {open && p.detail.case.subjectId ? (
        <Button
          small
          variant="secondary"
          label={t("legalCases.placeHold")}
          busy={p.busy}
          onPress={p.onHold}
        />
      ) : null}
      <Text style={type.heading}>{t("legalCases.notes")}</Text>
      {p.detail.notes.map((n) => (
        <Text key={n.id} style={type.small}>
          {new Date(n.createdAt).toDateString()} · {n.author ?? "—"}: {n.body}
        </Text>
      ))}
      <Field
        label={t("legalCases.addNote")}
        value={p.note}
        onChangeText={p.setNote}
        maxLength={4000}
        multiline
      />
      <View style={styles.row}>
        <Button
          small
          variant="secondary"
          label={t("legalCases.saveNote")}
          disabled={!p.note.trim()}
          busy={p.busy}
          onPress={p.onNote}
        />
        {open ? (
          <Button
            small
            variant="ghost"
            label={t("legalCases.close")}
            busy={p.busy}
            onPress={p.onClose}
          />
        ) : null}
        <Button
          small
          variant="ghost"
          label={t("legalCases.hide")}
          onPress={p.onHide}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  section: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  cardTitle: { ...type.body, fontWeight: "700" },
});

export default staffOnly(Legal, ["admin"]);
