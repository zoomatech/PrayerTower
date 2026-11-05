// Comments laid out Facebook style (Steve, 2026-11-02): "(+ x more)", replies indented, at most 3 levels.
import { fireEvent, screen, within } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { FbComments, type FbInk } from '@/components/fb-comments';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: {} })),
    comments: jest.fn(async () => ({ comments: [] })),
  },
}));

const INK: FbInk = { text: '#000', muted: '#333', link: '#000', thread: '#999', avatar: '#eee', avatarText: '#000' };
const c = (id: string, parentId: string | null, body: string, at: string) => ({ id, parentId, body, isUpdate: false, createdAt: `2026-11-02T10:${at}:00Z`, author: { displayName: `Name ${id}` } });

describe('Facebook-style comments', () => {
  it('shows one comment whole, with no "(+ x more)"', async () => {
    (api.comments as jest.Mock).mockResolvedValue({ comments: [c('a', null, 'Only one.', '00')] });
    await renderApp(<FbComments card={sampleCard({ counts: { ...sampleCard().counts, comments: 1 } })} ink={INK} />);
    expect(await screen.findByText('Only one.')).toBeTruthy();
    expect(screen.queryByText(/more\)/)).toBeNull();
  });

  it('stops replies at the 3rd level, lining deeper ones up there, and gives Reply only to top-level comments', async () => {
    const list = [c('a', null, 'Top.', '00'), c('b', 'a', 'Second level.', '01'), c('d', 'b', 'Third level.', '02'), c('e', 'd', 'Fourth, shown at the third.', '03'), c('z', null, 'Another.', '04')];
    (api.comments as jest.Mock).mockResolvedValue({ comments: list });
    await renderApp(<FbComments card={sampleCard({ counts: { ...sampleCard().counts, comments: 5 } })} ink={INK} testID="fb" />);
    expect(await screen.findByText('(+ 4 more)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('fb'));
    const second = await screen.findByTestId('fb-comment-b');
    // The 3rd level: its first reply showing, then "View all" for the one posted deeper.
    expect(within(second).getByTestId('fb-comment-d')).toBeTruthy();
    await fireEvent.press(within(second).getByText('View all 2 replies'));
    const fourth = within(second).getByTestId('fb-comment-e');
    expect(within(second).getByTestId('fb-comment-d')).not.toContainElement(fourth);
    expect(screen.getAllByText('Reply')).toHaveLength(2);
  });
});
