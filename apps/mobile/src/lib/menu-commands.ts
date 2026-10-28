// The app's menu bar commands and keyboard shortcuts on a Mac and on iPad with a
// keyboard (modules/mac-menu). Shown only to signed-in, onboarded members.
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { addMenuCommandListener, menuBarAvailable, setMenuCommands, type MenuCommand } from '../../modules/mac-menu';
import { useT } from '@/lib/i18n';

type Command = MenuCommand & { run: () => void };

function commands(t: ReturnType<typeof useT>): Command[] {
  const go = (href: Href) => () => router.navigate(href);
  return [
    { id: 'new-request', menu: 'file', key: 'n', title: t('menu.newRequest'), run: () => router.push('/compose') },
    { id: 'prayers', menu: 'go', key: '1', title: t('tabs.prayers'), run: go('/') },
    { id: 'promises', menu: 'go', key: '2', title: t('tabs.promises'), run: go('/commitments') },
    { id: 'messages', menu: 'go', key: '3', title: t('tabs.messages'), run: go('/messages') },
    { id: 'notices', menu: 'go', key: '4', title: t('tabs.notices'), run: go('/notifications') },
    { id: 'me', menu: 'go', key: '5', title: t('tabs.me'), run: go('/profile') },
    { id: 'back', menu: 'go', key: '[', title: t('menu.back'), run: () => router.canGoBack() && router.back() },
    { id: 'notification-settings', menu: 'go', key: ',', shift: true, title: t('menu.notificationSettings'), run: () => router.push('/notification-settings') },
    { id: 'tour', menu: 'help', key: '', title: t('menu.tour'), run: () => router.push('/tour') },
    { id: 'feedback', menu: 'help', key: '', title: t('menu.feedback'), run: () => router.push('/feedback') },
  ];
}

export function useMenuCommands(enabled: boolean) {
  const t = useT();
  useEffect(() => {
    if (!menuBarAvailable) return;
    if (!enabled) {
      setMenuCommands(t('menu.go'), []);
      return;
    }
    const list = commands(t);
    setMenuCommands(t('menu.go'), list.map(({ run: _run, ...c }) => c));
    const sub = addMenuCommandListener((id) => list.find((c) => c.id === id)?.run());
    return () => sub?.remove();
  }, [enabled, t]);
}
