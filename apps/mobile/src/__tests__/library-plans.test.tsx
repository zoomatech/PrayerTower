import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import ParallelsScreen from '@/app/parallels';
import ReadingPlansScreen from '@/app/reading-plans';
import { api, type PlanProgress, type ReadingPlans } from '@/lib/api';
import { router, useLocalSearchParams } from 'expo-router';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]),
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/lib/api', () => ({
  api: { parallels: jest.fn(), parallel: jest.fn(), readingPlans: jest.fn(), followPlan: jest.fn(), unfollowPlan: jest.fn(), planDay: jest.fn(), readPlanDay: jest.fn() },
}));
jest.mock('@/lib/features', () => ({ useFeatures: () => ({ libraryShare: true }) }));

const excerpt = (collection: 'bible-kjv' | 'oldest-texts', ref: string, text: string, citation: string) => ({
  collection,
  collectionTitle: collection === 'bible-kjv' ? 'King James Bible' : 'Oldest texts',
  work: { id: 'w', title: 'W', author: '' },
  ref,
  text,
  citation,
  key: ref.replace(/\W/g, '').padEnd(32, '0').slice(0, 32),
});

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

describe('Parallels', () => {
  it('lists the themes and opens one with every side and its citation', async () => {
    jest.mocked(api.parallels).mockResolvedValue({ enabled: true, themes: [{ id: 'flood', title: 'The great flood', intro: 'Heaven sends a flood.', texts: ['King James Bible', 'Oldest texts'] }] });
    await renderApp(<ParallelsScreen />);
    expect(await screen.findByText('The great flood')).toBeTruthy();
    expect(screen.getByText('King James Bible · Oldest texts')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('See them side by side: The great flood'));
    expect(router.push).toHaveBeenCalledWith('/parallels?theme=flood');

    jest.mocked(useLocalSearchParams).mockReturnValue({ theme: 'flood' });
    jest.mocked(api.parallel).mockResolvedValue({
      id: 'flood',
      title: 'The great flood',
      intro: 'Heaven sends a flood.',
      sides: [
        { label: 'The raven and the dove', ...excerpt('bible-kjv', 'Genesis 8:6–11', 'And it came to pass at the end of forty days', 'Genesis 8:6–11 (King James Bible)') },
        { label: null, ...excerpt('oldest-texts', 'Tablet XI, lines 142–155', 'I brought out a dove and let her go free.', 'Tablet XI, lines 142–155 (E. A. Wallis Budge (1920))') },
      ],
    });
    await renderApp(<ParallelsScreen />);
    expect(await screen.findByText('The raven and the dove')).toBeTruthy();
    expect(screen.getByText('I brought out a dove and let her go free.')).toBeTruthy();
    expect(screen.getByText('Tablet XI, lines 142–155 (E. A. Wallis Budge (1920))')).toBeTruthy();
    expect(screen.getByText('2 passages')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Share Genesis 8:6–11 (King James Bible) in a new post'));
    expect(jest.mocked(router.push).mock.calls.at(-1)![0]).toMatch(/^\/compose\?body=/);
  });

  it('says when parallels are off', async () => {
    jest.mocked(api.parallels).mockResolvedValue({ enabled: false });
    await renderApp(<ParallelsScreen />);
    expect(await screen.findByText('Parallels are not open.')).toBeTruthy();
  });
});

describe('Reading plans', () => {
  const plans = (following: PlanProgress | null): ReadingPlans => ({
    enabled: true,
    circles: [{ id: 'c1', name: 'Morning readers' }],
    plans: [{ id: 'psalms-30', title: 'Psalms in 30 days', intro: 'Five a day.', days: 30, faith: true, following, circles: [{ id: 'c1', name: 'Morning readers', readers: 2 }] }],
  });

  it('starts a plan with a circle, then shows progress and the next day', async () => {
    jest.mocked(api.readingPlans).mockResolvedValue(plans(null));
    jest.mocked(api.followPlan).mockResolvedValue(plans({ read: 3, next: 4, finished: false, reminders: true, circle: { id: 'c1', name: 'Morning readers' } }));
    await renderApp(<ReadingPlansScreen />);
    expect(await screen.findByText('Psalms in 30 days')).toBeTruthy();
    expect(screen.getByText('Morning readers: 2 people reading')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start with Morning readers'));
    expect(api.followPlan).toHaveBeenCalledWith('psalms-30', { circleId: 'c1' });
    expect(await screen.findByText('3 of 30 days read')).toBeTruthy();
    await fireEvent.press(screen.getByText('Read day 4'));
    expect(router.push).toHaveBeenCalledWith('/reading-plans?plan=psalms-30&day=4');
  });

  it('reads a day and marks it read', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ plan: 'psalms-30', day: '4' });
    const day = {
      plan: { id: 'psalms-30', title: 'Psalms in 30 days', days: 30 },
      day: 4,
      reading: excerpt('bible-kjv', 'Psalms 16–20', 'Preserve me, O God: for in thee do I put my trust.', 'Psalms 16–20 (King James Bible)'),
      read: false,
      following: { read: 3, next: 4, finished: false, reminders: true, circle: null },
      circle: { id: 'c1', name: 'Morning readers', readers: 1, reading: 2 },
    };
    jest.mocked(api.planDay).mockResolvedValue(day);
    jest.mocked(api.readPlanDay).mockResolvedValue({ ...day, read: true });
    await renderApp(<ReadingPlansScreen />);
    expect(await screen.findByText('Psalms 16–20 (King James Bible)')).toBeTruthy();
    expect(screen.getByText('Day 4 of 30')).toBeTruthy();
    expect(screen.getByText('Morning readers: 1 of 2 read this day')).toBeTruthy();
    await fireEvent.press(screen.getByText('I read it'));
    await waitFor(() => expect(screen.getByText('✓ Read')).toBeTruthy());
    expect(api.readPlanDay).toHaveBeenCalledWith('psalms-30', 4);
  });

  it('says when plans are off', async () => {
    jest.mocked(api.readingPlans).mockResolvedValue({ enabled: false });
    await renderApp(<ReadingPlansScreen />);
    expect(await screen.findByText('Reading plans are not open.')).toBeTruthy();
  });
});
