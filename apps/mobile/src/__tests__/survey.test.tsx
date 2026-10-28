// A member answering a survey.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import SurveyScreen from '@/app/survey/[id]';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;
const survey = {
  id: 's1',
  title: 'How are we doing?',
  intro: null,
  status: 'open',
  anonymous: true,
  community: null,
  closesAt: null,
  questions: [
    { id: 'q1', position: 1, kind: 'single', prompt: 'Do you feel welcome?', options: ['Yes', 'No'], required: true },
    { id: 'q2', position: 2, kind: 'scale', prompt: 'How safe do you feel?', options: ['Not safe', 'Very safe'], required: false },
    { id: 'q3', position: 3, kind: 'text', prompt: 'Anything else?', options: [], required: false },
  ],
};

beforeEach(() => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 's1' });
  mocked.surveys.mockResolvedValue({ surveys: [survey] });
  mocked.answerSurvey.mockResolvedValue({ ok: true });
});
afterEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({}));

it('waits for required answers, then sends only what was answered', async () => {
  await renderApp(<SurveyScreen />);
  expect(await screen.findByText('Do you feel welcome?')).toBeTruthy();
  expect(screen.getByText('Your answers are anonymous. We only ever see totals.')).toBeTruthy();
  const send = screen.getByRole('button', { name: 'Send my answers' });
  expect(send.props.accessibilityState.disabled).toBe(true);

  await fireEvent.press(screen.getByRole('radio', { name: 'Yes' }));
  await fireEvent.press(screen.getByRole('radio', { name: '4' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send my answers' }));
  await waitFor(() =>
    expect(mocked.answerSurvey).toHaveBeenCalledWith('s1', [
      { questionId: 'q1', choices: ['Yes'], value: undefined, text: undefined },
      { questionId: 'q2', choices: undefined, value: 4, text: undefined },
    ]),
  );
  expect(await screen.findByText('Thank you. Your answers were sent.')).toBeTruthy();
});

it('says so when the survey is closed or already answered', async () => {
  mocked.surveys.mockResolvedValue({ surveys: [] });
  await renderApp(<SurveyScreen />);
  expect(await screen.findByText('This survey is closed, or you already answered it.')).toBeTruthy();
});
