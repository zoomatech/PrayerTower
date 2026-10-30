// Messages: the list (requests first) and sending a note in a conversation.
import type { ConversationSummary, ConversationView } from '@prayer-tower/shared';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import Messages from '@/app/messages';
import { ConversationPane } from '@/components/conversation-pane';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: {
    conversations: jest.fn(),
    conversation: jest.fn(),
    markConversationRead: jest.fn(async () => ({})),
    features: jest.fn(async () => ({ features: {} })),
    precheck: jest.fn(async () => ({ warn: false })),
    sendMessage: jest.fn(async () => ({ message: { id: 'm2', createdAt: '', crisis: false } })),
    acceptConversation: jest.fn(async () => ({})),
  },
}));

const mocked = api as jest.Mocked<typeof api>;
const summary = (o: Partial<ConversationSummary>): ConversationSummary => ({
  id: 'c1', kind: 'prayer', postId: 'p1', title: 'Ruth', topic: null, isPublic: false, isRequest: false, isOwner: false,
  memberCount: 2, lastMessage: null, lastMessageAt: null, unread: 0, ...o,
});
const view = (o: Partial<ConversationView['conversation']> = {}, messages: ConversationView['messages'] = []): ConversationView => ({
  conversation: {
    id: 'c1', kind: 'prayer', title: 'Ruth', topic: null, isPublic: false, isRequest: false, isOwner: false, awaitingReply: false,
    post: { id: 'p1', excerpt: 'Please pray for my mother' }, members: [{ id: 'u1', name: 'Ruth', invited: false, isOwner: false }], ...o,
  },
  messages,
});

describe('Messages list', () => {
  it('lists message requests before conversations, with unread counts', async () => {
    mocked.conversations.mockResolvedValue({
      conversations: [summary({ id: 'c1', title: 'Ruth', lastMessage: 'Thank you for praying', unread: 2 }), summary({ id: 'c2', title: 'Sam', kind: 'direct', isRequest: true })],
    });
    await renderApp(<Messages />);
    expect(await screen.findByText('Requests and invites')).toBeTruthy();
    const titles = screen.getAllByText(/^(Ruth|Sam)$/).map((n) => n.props.children);
    expect(titles).toEqual(['Sam', 'Ruth']);
    expect(screen.getByText('2 new')).toBeTruthy();
    await fireEvent.press(screen.getByText('Ruth'));
    expect(router.push).toHaveBeenCalledWith('/conversation/c1');
  });

  it('explains how messages start when there are none', async () => {
    mocked.conversations.mockResolvedValue({ conversations: [] });
    await renderApp(<Messages />);
    expect(await screen.findByText(/After you pray for someone, you can send them a private note/)).toBeTruthy();
  });
});

describe('A conversation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the messages and sends a new one', async () => {
    mocked.conversation.mockResolvedValue(view({}, [{ id: 'm1', mine: false, author: 'Ruth', body: 'Thank you for praying', crisis: false, createdAt: '2026-10-28T12:00:00Z' }]));
    await renderApp(<ConversationPane id="c1" />);
    expect(await screen.findByText('Thank you for praying')).toBeTruthy();
    expect(screen.getByText('Please pray for my mother')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('message-input'), '  Praying for her today.  ');
    await fireEvent.press(screen.getByTestId('message-send'));
    expect(mocked.sendMessage).toHaveBeenCalledWith('c1', 'Praying for her today.');
    expect(screen.getByTestId('message-input').props.value).toBe('');
  });

  it('checks again for new messages every few seconds', async () => {
    mocked.conversation.mockResolvedValue(view());
    await renderApp(<ConversationPane id="c1" />);
    const before = mocked.conversation.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mocked.conversation.mock.calls.length).toBe(before + 1);
  });

  it('shows crisis support when a message mentions self-harm', async () => {
    mocked.conversation.mockResolvedValue(view());
    mocked.sendMessage.mockResolvedValueOnce({ message: { id: 'm2', createdAt: '', crisis: true } });
    await renderApp(<ConversationPane id="c1" />);
    await fireEvent.changeText(await screen.findByTestId('message-input'), 'I want to hurt myself');
    await fireEvent.press(screen.getByTestId('message-send'));
    expect((await screen.findAllByText(/988/)).length).toBeGreaterThan(0);
  });

  it('lets the member accept a message request', async () => {
    mocked.conversation.mockResolvedValue(view({ kind: 'direct', isRequest: true }));
    await renderApp(<ConversationPane id="c1" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    expect(mocked.acceptConversation).toHaveBeenCalledWith('c1');
  });
});
