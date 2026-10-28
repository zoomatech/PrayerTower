// Links on Me to the two AI features; each shows only while it is switched on.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

import { Button } from './ui';

export function AiLinks() {
  const t = useT();
  const [chat, setChat] = useState(false);
  const [facilitator, setFacilitator] = useState(false);
  useFocusEffect(
    useCallback(() => {
      api.aiChatInfo().then((r) => setChat(!!r?.enabled)).catch(() => setChat(false));
      api.facilitatorInfo().then((r) => setFacilitator(!!r?.enabled)).catch(() => setFacilitator(false));
    }, []),
  );
  return (
    <>
      {chat ? <Button small variant="secondary" label={t('ai.chatLink')} onPress={() => router.push('/ai-chat')} /> : null}
      {facilitator ? <Button small variant="secondary" label={t('ai.facLink')} onPress={() => router.push('/circle-prep')} /> : null}
    </>
  );
}
