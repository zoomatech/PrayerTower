// Lament posts (docs/GROWTH_PRACTICES.md): on their own post, the author can mark it as
// a lament (grief to be heard, not fixed) and say whether it may go out by radio.
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorText, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { space } from '@/lib/theme';

export function LamentControls({ postId, lament, radio, onChange }: { postId: string; lament: boolean; radio: boolean; onChange: (lament: boolean, radio: boolean) => void }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const save = (patch: { lament?: boolean; radio?: boolean }) =>
    api.setLament(postId, patch).then(
      (r) => {
        setError(null);
        onChange(r.lament, r.lamentRadio);
      },
      (e) => setError((e as Error).message),
    );
  return (
    <View style={{ gap: space.xs }} testID="lament-controls">
      <Toggle label={t('lament.toggle')} hint={t('lament.toggleHint')} value={lament} onChange={(v) => save({ lament: v })} />
      {lament ? <Toggle label={t('lament.radio')} hint={t('lament.radioHint')} value={radio} onChange={(v) => save({ radio: v })} /> : null}
      <ErrorText error={error} />
    </View>
  );
}
