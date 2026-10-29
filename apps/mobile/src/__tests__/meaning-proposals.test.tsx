// Member-made emoji meanings: a member picks an emoji and suggests words; an admin can
// reword, and must choose one to retire when the emoji already has five.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { MeaningProposals, MeaningProposalsAdmin } from '@/components/meaning-proposals';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(),
    reactionMeanings: jest.fn(),
    meaningProposals: jest.fn(),
    proposeMeaning: jest.fn(),
    admin: { meaningProposals: jest.fn(), decideMeaningProposal: jest.fn() },
  },
}));

const on = (meaningProposals: boolean) =>
  jest.mocked(api.features).mockResolvedValue({ features: { meaningReactions: true, meaningProposals } } as unknown as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.reactionMeanings).mockResolvedValue({ emoji: [{ key: 'love', emoji: '❤️', meanings: [{ key: 'love_you', label: 'Love you', neutralLabel: 'Love you' }] }] });
  jest.mocked(api.meaningProposals).mockResolvedValue({ proposals: [] });
});

describe('Suggest an emoji meaning', () => {
  it('stays hidden while off', async () => {
    on(false);
    await renderApp(<MeaningProposals />);
    expect(screen.queryByTestId('meaning-proposals')).toBeNull();
  });

  it('sends the emoji and words, and lists it as waiting', async () => {
    on(true);
    jest.mocked(api.proposeMeaning).mockResolvedValue({ proposals: [{ id: 'm1', emoji: 'love', label: 'You matter', status: 'pending', createdAt: '' }] });
    await renderApp(<MeaningProposals />);
    await act(async () => fireEvent.press(await screen.findByText('❤️')));
    await act(async () => fireEvent.changeText(screen.getByTestId('meaning-proposal-text'), 'You matter'));
    await act(async () => fireEvent.press(screen.getByText('Suggest it')));
    expect(api.proposeMeaning).toHaveBeenCalledWith('love', 'You matter');
    expect(screen.getByText(/You matter: waiting/)).toBeTruthy();
  });

  it('admin must choose a meaning to retire when the emoji is full', async () => {
    const current = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, label: `Meaning ${k}` }));
    jest.mocked(api.admin.meaningProposals).mockResolvedValue({ proposals: [{ id: 'p1', emoji: 'love', icon: '❤️', label: 'You matter', createdAt: '', current }] });
    jest.mocked(api.admin.decideMeaningProposal).mockResolvedValue({ status: 'approved' });
    await renderApp(<MeaningProposalsAdmin />);
    await screen.findByText(/You matter/);
    await act(async () => fireEvent.press(screen.getByText('Meaning e')));
    await act(async () => fireEvent.press(screen.getByText('Add it')));
    expect(api.admin.decideMeaningProposal).toHaveBeenCalledWith('p1', { approve: true, replaces: 'e' });
  });
});
