// Open surveys at the top of the feed: each one the member hasn't answered, with a button to take it.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import { SurveyPrompts } from '@/components/survey-prompts';
import { api, type Survey } from '@/lib/api';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (f: () => void) => require('react').useEffect(f, [f]) }));
jest.mock('@/lib/api', () => ({ api: { surveys: jest.fn() } }));

const survey = { id: 's1', title: 'How is the pilot going?', intro: 'Three questions.', status: 'open', anonymous: true, community: null } as Survey;

describe('SurveyPrompts', () => {
  it('shows each open survey and opens it', async () => {
    jest.mocked(api.surveys).mockResolvedValue({ surveys: [survey] } as Awaited<ReturnType<typeof api.surveys>>);
    await renderApp(<SurveyPrompts />);
    expect(await screen.findByText('A short survey: How is the pilot going?')).toBeTruthy();
    expect(screen.getByText('Three questions.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Take the survey' }));
    expect(router.push).toHaveBeenCalledWith('/survey/s1');
  });

  it('shows nothing, and no error, when surveys cannot load', async () => {
    jest.mocked(api.surveys).mockRejectedValue(new Error('offline'));
    await renderApp(<SurveyPrompts />);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.toJSON()).toBeNull();
  });
});
