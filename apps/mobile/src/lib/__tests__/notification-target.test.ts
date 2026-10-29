// Where a tapped notice opens: the same table for pushes and the Notifications tab.
import { notificationTarget } from '@/lib/notification-target';

describe('notificationTarget', () => {
  it('opens the thing the notice is about', () => {
    expect(notificationTarget({ postId: 'p1' })).toBe('/post/p1');
    expect(notificationTarget({ postId: 'p1', believe: true })).toBe('/post/p1?believe=1');
    expect(notificationTarget({ conversationId: 'c1' })).toBe('/conversation/c1');
    expect(notificationTarget({ careRequestId: 'r1' })).toBe('/care');
    expect(notificationTarget({ screen: 'circle', circleId: 'k1' })).toBe('/circles/k1');
    expect(notificationTarget({ screen: 'account-security' })).toBe('/account-security');
    expect(notificationTarget({ awardId: 'a1' })).toBe('/profile');
    expect(notificationTarget({ churchId: 'ch1' })).toBe('/church');
  });

  it('opens the staff screen for staff notices', () => {
    expect(notificationTarget({ itemIds: ['i1'] })).toBe('/moderation');
    expect(notificationTarget({ caseId: 'l1' })).toBe('/legal');
    expect(notificationTarget({ alert: 'stale', callSign: 'W1AW' })).toBe('/operator-console');
    expect(notificationTarget({ problems: ['worker_down'] })).toBe('/ops');
  });

  it('opens nothing for a notice with no screen', () => {
    expect(notificationTarget({ itemId: 'i1', appealable: true })).toBeNull();
    expect(notificationTarget({})).toBeNull();
    expect(notificationTarget(null)).toBeNull();
  });
});
