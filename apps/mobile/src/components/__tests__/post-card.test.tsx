// The feed card: what a new member sees on each request, and that every action button reaches its handler.
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { PostCard } from '@/components/post-card';
import { LocaleProvider } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(async () => ({ features: { supportLabel: true } })) } }));

describe('PostCard', () => {
  it('shows the author, the request and an invitation to be the first to pray', async () => {
    await renderApp(<PostCard card={sampleCard()} onAction={jest.fn()} />);
    expect(await screen.findByText('Ruth')).toBeTruthy();
    expect(screen.getByText('Please pray for my mother, who has surgery on Friday.')).toBeTruthy();
    expect(screen.getByText(/first to pray/i)).toBeTruthy();
  });

  it('sends each labeled action to the handler', async () => {
    const onAction = jest.fn();
    const card = sampleCard();
    await renderApp(<PostCard card={card} onAction={onAction} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Praying Now' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Commit to Pray' }));
    expect(onAction).toHaveBeenNthCalledWith(1, card, 'praying_now');
    expect(onAction).toHaveBeenNthCalledWith(2, card, 'commit');
  });

  it('marks a request the member already committed to', async () => {
    await renderApp(<PostCard card={sampleCard({ myCommitment: { id: 'c1', frequency: 'daily' } })} onAction={jest.fn()} />);
    expect(await screen.findByText(/^Committed/)).toBeTruthy();
  });

  it('shows a long request in short form until "more" is tapped', async () => {
    const body = 'word '.repeat(80).trim();
    await renderApp(<PostCard card={sampleCard({ body, preview: 'word word word', truncated: true })} onAction={jest.fn()} />);
    expect(screen.queryByText(body)).toBeNull();
    await fireEvent.press(await screen.findByText('more'));
    expect(screen.getByText(body)).toBeTruthy();
  });

  it('offers "not for me" on other people\'s posts only', async () => {
    const onHide = jest.fn();
    const { rerender } = await renderApp(<PostCard card={sampleCard()} onAction={jest.fn()} onHide={onHide} />);
    await fireEvent.press(await screen.findByRole('button', { name: /not for me/i }));
    expect(onHide).toHaveBeenCalled();
    await rerender(<LocaleProvider><PostCard card={sampleCard({ isMine: true })} onAction={jest.fn()} onHide={onHide} /></LocaleProvider>);
    expect(screen.queryByRole('button', { name: /not for me/i })).toBeNull();
  });

  it('opens the request when its text is tapped', async () => {
    await renderApp(<PostCard card={sampleCard()} onAction={jest.fn()} />);
    await fireEvent.press(await screen.findByRole('link', { name: /Please pray for my mother/ }));
    expect(router.push).toHaveBeenCalledWith('/post/00000000-0000-4000-8000-000000000001');
  });

  it('shows the "all support welcome" label when the switch is on', async () => {
    await renderApp(<PostCard card={sampleCard({ allSupportWelcome: true })} onAction={jest.fn()} />);
    expect(await screen.findByText(/positive thoughts welcome/i)).toBeTruthy();
  });
});

describe('the prayer count line', () => {
  it('does not ask the poster to be the first to pray for their own request', async () => {
    await renderApp(<PostCard card={sampleCard({ isMine: true })} onAction={jest.fn()} />);
    expect(await screen.findByText('No one has prayed yet')).toBeTruthy();
    expect(screen.queryByText(/first to pray/i)).toBeNull();
  });

  it('says nothing about praying on a praise nobody has prayed over', async () => {
    await renderApp(<PostCard card={sampleCard({ postType: 'praise' })} onAction={jest.fn()} />);
    await screen.findByText('Ruth');
    expect(screen.queryByText(/first to pray/i)).toBeNull();
  });

  it('shows no prayer count on a blog post', async () => {
    await renderApp(<PostCard card={sampleCard({ postType: 'blog', cardType: 'blog', body: 'What our pantry learned.', actions: ['encouragement', 'share'] })} onAction={jest.fn()} />);
    expect(await screen.findByText('What our pantry learned.')).toBeTruthy();
    expect(screen.queryByText(/first to pray/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Praying Now' })).toBeNull();
  });
});
