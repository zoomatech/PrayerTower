// Moderation tools (Admin → Moderation tools, off): search waiting reports and
// past decisions, and decide several waiting reports at once. Someone who may be
// in danger can't be selected: those are decided one at a time in the queue below.
import { MODERATION_RULES, type ModerationItem, type ModerationRule } from '@prayer-tower/shared';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, ErrorText, Field } from '@/components/ui';
import { api, type ModerationSearchItem } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const SOURCES: ModerationItem['source'][] = ['report', 'ai', 'harm', 'crisis'];

export function ModerationTools({ ruleChoices, onDecided }: { ruleChoices: ModerationRule[]; onDecided: () => void }) {
  const { moderationTools } = useFeatures();
  const { t, label, language: locale } = useLocale();
  const [words, setWords] = useState('');
  const [status, setStatus] = useState<'pending' | 'decided'>('pending');
  const [source, setSource] = useState<ModerationItem['source'] | null>(null);
  const [items, setItems] = useState<ModerationSearchItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rule, setRule] = useState<ModerationRule>('other');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    try {
      const r = await api.moderationSearch({
        q: words.trim() || undefined,
        status,
        source: source ?? undefined,
      });
      setItems(r.items);
      setSelected([]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [words, status, source]);

  useEffect(() => {
    if (moderationTools) search();
    // Typing doesn't search on every key; the chips and the Search button do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moderationTools, status, source]);

  if (!moderationTools) return null;
  const ruleLabel = (r: ModerationRule) => label('moderationRule', r, MODERATION_RULES[r]);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  const selectable = (items ?? []).filter((i) => i.status === 'pending' && i.source !== 'crisis');

  const bulk = async (action: 'dismiss' | 'remove') => {
    try {
      const r = await api.bulkDecide({
        ids: selected,
        action,
        rule: action === 'remove' ? rule : undefined,
      });
      setNote(
        r.skipped.length
          ? `${t('modTools.done', { count: r.decided.length })} ${t('modTools.skipped', { count: r.skipped.length, reasons: [...new Set(r.skipped.map((s) => s.reason))].join('; ') })}`
          : t('modTools.done', { count: r.decided.length }),
      );
      await search();
      onDecided();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <View style={styles.panel} testID="moderation-tools">
      <Text style={type.heading}>{t('modTools.title')}</Text>
      <Field label={t('modTools.search')} value={words} onChangeText={setWords} onSubmitEditing={search} placeholder={t('modTools.searchHint')} />
      <View style={styles.row} role="radiogroup" aria-label={t('modTools.show')}>
        <Chip radio label={t('modTools.waiting')} selected={status === 'pending'} onPress={() => setStatus('pending')} />
        <Chip radio label={t('modTools.decided')} selected={status === 'decided'} onPress={() => setStatus('decided')} />
      </View>
      <View style={styles.row} role="radiogroup" aria-label={t('modTools.from')}>
        <Chip radio label={t('modTools.anySource')} selected={source === null} onPress={() => setSource(null)} />
        {SOURCES.map((s) => (
          <Chip radio key={s} label={t(`moderation.source.${s}`)} selected={source === s} onPress={() => setSource(s)} />
        ))}
      </View>
      <Button small variant="secondary" label={t('modTools.searchButton')} onPress={search} />
      <ErrorText error={error} />
      {note ? <Text style={type.small}>{note}</Text> : null}
      {items && items.length === 0 ? <Empty text={t('modTools.none')} /> : null}
      {status === 'pending' && selectable.length > 1 ? (
        <Button
          small
          variant="ghost"
          label={selected.length === selectable.length ? t('modTools.selectNone') : t('modTools.selectAll', { count: selectable.length })}
          onPress={() => setSelected(selected.length === selectable.length ? [] : selectable.map((i) => i.id))}
        />
      ) : null}
      {(items ?? []).map((i) => (
        <View key={i.id} style={styles.item}>
          <Text style={styles.meta}>
            {t(`moderation.target.${i.target_type}`)} · {t(`moderation.source.${i.source}`)} · {i.author_name ?? t('modTools.unknown')} · {when(i.created_at)}
          </Text>
          <Text style={type.body} numberOfLines={4}>
            {i.content ?? t('moderation.gone')}
          </Text>
          {i.reason ? <Text style={type.small}>{t('moderation.why', { reason: i.reason })}</Text> : null}
          {i.status !== 'pending' ? (
            <Text style={type.small}>
              {i.status === 'dismissed' ? t('modTools.kept') : t('modTools.removed', { rule: ruleLabel(i.rule ?? 'other') })}
              {' · '}
              {t('modTools.by', {
                name: i.decided_by_name ?? t('modTools.unknown'),
                when: i.decided_at ? when(i.decided_at) : '',
              })}
            </Text>
          ) : i.source === 'crisis' ? (
            <Text style={type.small}>{t('modTools.crisisAlone')}</Text>
          ) : (
            <Chip
              label={t('modTools.select')}
              selected={selected.includes(i.id)}
              onPress={() => setSelected((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]))}
            />
          )}
        </View>
      ))}
      {selected.length ? (
        <View style={styles.bulk}>
          <Text style={type.body}>{t('modTools.selected', { count: selected.length })}</Text>
          <Text style={type.small}>{t('moderation.ruleBroken')}</Text>
          <View style={styles.row} role="radiogroup" aria-label={t('moderation.ruleBroken')}>
            {ruleChoices.map((r) => (
              <Chip radio key={r} label={ruleLabel(r)} selected={rule === r} onPress={() => setRule(r)} />
            ))}
          </View>
          <View style={styles.row}>
            <Button small variant="secondary" label={t('modTools.keepAll', { count: selected.length })} onPress={() => bulk('dismiss')} />
            <Button small label={t('modTools.removeAll', { count: selected.length })} onPress={() => bulk('remove')} />
          </View>
          <Text style={type.small}>{t('modTools.bulkNote')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  item: {
    gap: space.xs,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  meta: { ...type.small, fontWeight: '600' },
  bulk: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
