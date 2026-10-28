// The two AI screens: the pinned not-God warning, and the circle facilitator.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import AiChat from '@/app/ai-chat';
import CirclePrep from '@/app/circle-prep';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me', display_name: 'Ruth' } }) }));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;
const WARNING = 'This is an AI. It is not God, and it does not speak for God.';

describe('Imagine a conversation with God', () => {
  it('pins the warning, labels the AI, and shows crisis support when needed', async () => {
    mocked.aiChatInfo.mockResolvedValue({ enabled: true, warning: WARNING });
    mocked.aiChat.mockResolvedValue({ warning: WARNING, reply: 'I am listening.', crisis: true });
    await renderApp(<AiChat />);
    expect(await screen.findByText(WARNING)).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Write what is on your heart…'), 'I feel hopeless');
    await fireEvent.press(screen.getByText('Send'));
    expect(await screen.findByText('I am listening.')).toBeTruthy();
    expect(screen.getByText('AI (not God)')).toBeTruthy();
    expect(mocked.aiChat).toHaveBeenCalledWith('I feel hopeless', []);
    expect(screen.getByText(/free, confidential and open 24\/7/)).toBeTruthy();
  });
});

describe('Prepare for a circle', () => {
  it('asks the first question, then sends the summary to a moderator', async () => {
    mocked.facilitatorInfo.mockResolvedValue({ enabled: true, questions: { harmed: ['What did you think when you realized what had happened?'], caused: ['What happened?'], unsure: ['What happened?'] } });
    mocked.facilitate.mockResolvedValue({ reply: 'Thank you.\nSummary: I was hurt by a comment and want to talk it through.', crisis: false, ai: true });
    mocked.askForCircle.mockResolvedValue({ id: 'c1' });
    await renderApp(<CirclePrep />);
    await fireEvent.press(await screen.findByText('I was hurt'));
    expect(screen.getByText('What did you think when you realized what had happened?')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Your answer…'), 'I was shocked.');
    await fireEvent.press(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByDisplayValue('I was hurt by a comment and want to talk it through.')).toBeTruthy());
    await fireEvent.press(screen.getByText('Ask for a circle'));
    expect(await screen.findByText('Sent. A moderator will contact you about a circle.')).toBeTruthy();
    expect(mocked.askForCircle).toHaveBeenCalledWith('harmed', 'I was hurt by a comment and want to talk it through.');
  });
});
