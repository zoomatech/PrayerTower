// "Tell Steve" (Admin → Pilot tools, off by default): a shortcut from the feed
// and Me to the feedback form, named for whoever runs the pilot.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';

export function TellFounder({ small = false }: { small?: boolean }) {
  const { t } = useLocale();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // Off, or not reachable: nothing shows.
    api.pilotTell().then((r) => live && setName(r.enabled ? r.name : null), () => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!name) return null;
  return (
    <Button
      small={small}
      variant="secondary"
      label={t('pilot.tell', { name })}
      onPress={() => router.push({ pathname: '/feedback', params: { to: name } })}
    />
  );
}
