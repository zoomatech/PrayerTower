// Posting a prayer request or a praise.
import { fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import Compose from '@/app/compose';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: { supportLabel: false } })),
    createPostOrQueue: jest.fn(),
    createPost: jest.fn(),
  },
}));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me', display_name: 'Ruth', anonymous_by_default: false } }) }));

const create = api.createPostOrQueue as jest.Mock;
afterEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({}));

describe('Compose', () => {
  beforeEach(() => create.mockResolvedValue({ post: sampleCard() }));

  it('greets the member by name', async () => {
    await renderApp(<Compose />);
    expect(screen.getByText("Welcome, Ruth! Let's talk to the Lord.")).toBeTruthy();
  });

  it('posts a prayer request with the chosen urgency and goes back to the feed', async () => {
    await renderApp(<Compose />);
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Your prayer'), '  Please pray for my job interview.  ');
    await fireEvent.press(screen.getByText('Today'));
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ postType: 'prayer_request', body: 'Please pray for my job interview.', urgency: 2, isAnonymous: false, isSensitive: false, allSupportWelcome: false }),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('posts anonymously when asked', async () => {
    await renderApp(<Compose />);
    await fireEvent.changeText(screen.getByLabelText('Your prayer'), 'Please pray for me.');
    await fireEvent.press(screen.getByRole('switch', { name: /Post anonymously/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ isAnonymous: true }));
  });

  it('opens a request that mentions self-harm with crisis support showing', async () => {
    create.mockResolvedValueOnce({ post: sampleCard({ id: 'p-crisis', crisis: true }) });
    await renderApp(<Compose />);
    await fireEvent.changeText(screen.getByLabelText('Your prayer'), 'I want to end it all.');
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(router.replace).toHaveBeenCalledWith('/post/p-crisis');
  });

  it('opens a praise with the celebration (from the thanksgiving card)', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ type: 'praise' });
    create.mockResolvedValueOnce({ post: sampleCard({ id: 'p-praise', postType: 'praise' }) });
    await renderApp(<Compose />);
    await fireEvent.changeText(screen.getByLabelText('Your prayer'), 'Thank you, Lord, the surgery went well!');
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ postType: 'praise' }));
    expect(router.replace).toHaveBeenCalledWith('/post/p-praise?celebrate=1');
  });

  it('goes back when offline: the post waits and is sent later', async () => {
    create.mockResolvedValueOnce({ queued: true });
    await renderApp(<Compose />);
    await fireEvent.changeText(screen.getByLabelText('Your prayer'), 'Please pray for rain.');
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows why a post was refused and stays on the screen', async () => {
    create.mockRejectedValueOnce(new Error('New members can post 3 requests a day'));
    await renderApp(<Compose />);
    await fireEvent.changeText(screen.getByLabelText('Your prayer'), 'Please pray.');
    await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText('New members can post 3 requests a day')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('will not post more than 1,000 words', async () => {
    await renderApp(<Compose />);
    await fireEvent.changeText(screen.getByLabelText('Your prayer'), 'amen '.repeat(1001));
    expect(screen.getByText('1001/1000 words')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });
});

it('goes to the feed after posting when there is nothing to go back to (opened from a link)', async () => {
  (router.canGoBack as jest.Mock).mockReturnValueOnce(false);
  create.mockResolvedValueOnce({ post: sampleCard() });
  await renderApp(<Compose />);
  await fireEvent.changeText(screen.getByLabelText('Your prayer'), 'Please pray for my job interview.');
  await fireEvent.press(screen.getByRole('button', { name: 'Post' }));
  expect(router.replace).toHaveBeenCalledWith('/');
  expect(router.back).not.toHaveBeenCalled();
});
