// Prayer without ceasing (docs/STATION_OPERATOR_GUIDE.md): on their own request,
// the author can keep it on the air, so the station sends it again now and then
// whenever nothing else is waiting. Off with the admin's switch.
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorText, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { space } from '@/lib/theme';

export function KeepOnAir({ postId, on, onChange }: { postId: string; on: boolean; onChange: (on: boolean) => void }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const save = (v: boolean) =>
    api.setKeepOnAir(postId, v).then(
      (r) => {
        setError(null);
        onChange(r.keepOnAir);
      },
      (e) => setError((e as Error).message),
    );
  return (
    <View style={{ gap: space.xs }} testID="keep-on-air">
      <Toggle label={t('keepOnAir.toggle')} hint={t('keepOnAir.hint')} value={on} onChange={save} />
      <ErrorText error={error} />
    </View>
  );
}
