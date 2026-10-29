// Where a notice opens, from its data: the same for a tapped push and a tapped row in
// Notifications. Notices the app has no screen for (a member's own moderation notice,
// which has its own buttons) open nothing.
const SCREENS: Record<string, string> = {
  highlights: '/highlights',
  'prayer-minute': '/prayer-minute',
  give: '/give',
  'radio-requests': '/radio-requests',
  'feedback-triage': '/feedback-triage',
  gratitude: '/profile',
  encourager: '/profile',
  partner: '/profile',
  'prayer-list': '/prayer-list',
  crosspost: '/crosspost',
  'account-security': '/account-security',
  circle: '/circles',
  feed: '/',
};

export function notificationTarget(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const id = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : null);
  if (id('mendId')) return `/mend/${id('mendId')}`;
  if (id('storyId')) return '/help-stories';
  if (id('careRequestId')) return '/care';
  if (id('conversationId')) return `/conversation/${id('conversationId')}`;
  if (id('eventId')) return `/event/${id('eventId')}`;
  if (id('postId')) return `/post/${id('postId')}${data.believe ? '?believe=1' : ''}`;
  if (data.screen === 'circle' && id('circleId')) return `/circles/${id('circleId')}`;
  if (typeof data.screen === 'string' && SCREENS[data.screen]) return SCREENS[data.screen]!;
  if (id('personId')) return `/people/${id('personId')}`;
  // A Prayer Warrior award is accepted on Me; a church decision shows on the church page.
  if (id('awardId')) return '/profile';
  if (id('churchId')) return '/church';
  // Staff notices.
  if (Array.isArray(data.itemIds) || id('reportId')) return '/moderation';
  if (id('caseId')) return '/legal';
  if (id('alert')) return '/operator-console';
  if (id('ledgerCheckId')) return '/admin';
  if (Array.isArray(data.problems) || Array.isArray(data.tasks)) return '/ops';
  return null;
}
