// A member answering one survey. Each question is one of: one answer, several
// answers, a 1 to 5 scale, or a written answer.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  Button,
  Chip,
  Empty,
  ErrorText,
  Field,
  Loading,
  Screen,
} from "@/components/ui";
import { api, type Survey, type SurveyAnswer } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { space, type } from "@/lib/theme";

type Draft = Record<
  string,
  { choices: string[]; value?: number; text: string }
>;

export default function SurveyScreen() {
  const { t } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = () => {
    setError(null);
    api.surveys().then(
      (r) => setSurvey(r.surveys.find((s) => s.id === id) ?? null),
      (e) => setError((e as Error).message),
    );
  };
  useEffect(load, [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const entry = (qid: string) => draft[qid] ?? { choices: [], text: "" };
  const set = (qid: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [qid]: { ...entry(qid), ...patch } }));
  const answered = (qid: string) => {
    const e = entry(qid);
    return (
      e.choices.length > 0 || e.value !== undefined || e.text.trim().length > 0
    );
  };

  const send = async () => {
    if (!survey) return;
    setBusy(true);
    setError(null);
    try {
      const answers: SurveyAnswer[] = survey.questions
        .filter((q) => answered(q.id))
        .map((q) => {
          const e = entry(q.id);
          return {
            questionId: q.id,
            choices: e.choices.length ? e.choices : undefined,
            value: e.value,
            text: e.text.trim() || undefined,
          };
        });
      await api.answerSurvey(survey.id, answers);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const content = () => {
    if (sent) return <Text style={type.body}>{t("surveys.thanks")}</Text>;
    if (survey === undefined)
      return error ? <ErrorText error={error} onRetry={load} /> : <Loading />;
    if (survey === null) return <Empty text={t("surveys.gone")} />;
    const ready = survey.questions.every((q) => !q.required || answered(q.id));
    return (
      <>
        <Text style={type.title}>{survey.title}</Text>
        {survey.intro ? <Text style={type.body}>{survey.intro}</Text> : null}
        <Text style={type.small}>
          {t(survey.anonymous ? "surveys.anonymous" : "surveys.named")}
        </Text>
        {survey.questions.map((q) => {
          const e = entry(q.id);
          return (
            <View
              key={q.id}
              style={styles.question}
              role="group"
              aria-label={q.prompt}
            >
              <Text style={type.heading}>{q.prompt}</Text>
              {q.required ? (
                <Text style={type.small}>{t("surveys.required")}</Text>
              ) : null}
              {q.kind === "single" || q.kind === "multi" ? (
                <>
                  <Text style={type.small}>
                    {t(
                      q.kind === "single"
                        ? "surveys.pickOne"
                        : "surveys.pickAny",
                    )}
                  </Text>
                  <View style={styles.row}>
                    {q.options.map((o) => (
                      <Chip
                        key={o}
                        label={o}
                        radio={q.kind === "single"}
                        selected={e.choices.includes(o)}
                        onPress={() =>
                          set(q.id, {
                            choices:
                              q.kind === "single"
                                ? e.choices.includes(o)
                                  ? []
                                  : [o]
                                : e.choices.includes(o)
                                  ? e.choices.filter((c) => c !== o)
                                  : [...e.choices, o],
                          })
                        }
                      />
                    ))}
                  </View>
                </>
              ) : q.kind === "scale" ? (
                <>
                  {q.options.length === 2 ? (
                    <Text
                      style={type.small}
                    >{`1 = ${q.options[0]} · 5 = ${q.options[1]}`}</Text>
                  ) : null}
                  <View style={styles.row}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <Chip
                        key={v}
                        label={String(v)}
                        radio
                        selected={e.value === v}
                        onPress={() =>
                          set(q.id, { value: e.value === v ? undefined : v })
                        }
                      />
                    ))}
                  </View>
                </>
              ) : (
                <Field
                  value={e.text}
                  onChangeText={(text) => set(q.id, { text })}
                  placeholder={t("surveys.textPlaceholder")}
                  maxLength={2000}
                  multiline
                  accessibilityLabel={q.prompt}
                />
              )}
            </View>
          );
        })}
        <ErrorText error={error} />
        <Button
          label={t("surveys.send")}
          onPress={send}
          busy={busy}
          disabled={!ready}
        />
      </>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t("common.back")} onPress={back} />
        {content()}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  question: { gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
