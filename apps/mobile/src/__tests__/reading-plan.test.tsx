import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import ReadingPlanScreen from '@/app/reading-plan';
import { api } from '@/lib/api';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, []) }));
jest.mock('@/lib/api', () => ({
  api: { readingPlan: jest.fn(), markReadingRead: jest.fn(), staffReadingPlans: jest.fn(), createReadingPlan: jest.fn(), archiveReadingPlan: jest.fn() },
}));

const reading = { reference: 'John 2', url: 'https://www.biblegateway.com/passage/?search=John%202&version=WEB', read: false, readers: 3 };
const today = { enabled: true as const, plan: { id: 'p1', title: 'Gospel of John', day: 2, days: 21, conversationId: null, reading } };

describe('Bible reading plan', () => {
  it("opens today's passage and marks it read", async () => {
    jest.mocked(api.readingPlan).mockResolvedValue(today);
    jest.mocked(api.staffReadingPlans).mockRejectedValue(new Error('Admins and pastors only'));
    jest.mocked(api.markReadingRead).mockResolvedValue({ ...today, plan: { ...today.plan, reading: { ...reading, read: true, readers: 4 } } });
    await renderApp(<ReadingPlanScreen />);
    expect(await screen.findByText('John 2')).toBeTruthy();
    expect(screen.getByText('Gospel of John: day 2 of 21')).toBeTruthy();
    await fireEvent.press(screen.getByText('Read it'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(reading.url);
    await fireEvent.press(screen.getByText('I read it'));
    expect(await screen.findByText("You read today's passage.")).toBeTruthy();
    expect(screen.queryByText('Plans (admins and pastors)')).toBeNull();
  });

  it('lets a pastor start a plan', async () => {
    jest.mocked(api.readingPlan).mockResolvedValue({ enabled: true, plan: null });
    jest.mocked(api.staffReadingPlans).mockResolvedValue({ plans: [] });
    jest.mocked(api.createReadingPlan).mockResolvedValue({ id: 'p2' });
    await renderApp(<ReadingPlanScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Plan name'), 'Psalms');
    await fireEvent.changeText(screen.getByLabelText('One passage per line, one per day'), 'Psalm 1\nPsalm 23\n');
    await fireEvent.press(screen.getByText('Start plan (2 days)'));
    await waitFor(() => expect(api.createReadingPlan).toHaveBeenCalledWith(expect.objectContaining({ title: 'Psalms', references: ['Psalm 1', 'Psalm 23'] })));
  });
});
