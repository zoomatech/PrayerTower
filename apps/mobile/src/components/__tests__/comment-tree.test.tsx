// Comment tree (Admin → Feed skins): each comment inside a leaf on a drawn vine,
// newest at the top (present to past). A branch shows a few leaves and the older
// ones wait in a faded blur until tapped; no reply link at the deepest level, so
// a chain can't keep going.
import type { Comment } from '@prayer-tower/shared';
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { CommentTree, branchesOf, newestFirst } from '@/components/comment-tree';
import { vineTokens } from '@/layouts/vine';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn().mockResolvedValue({ features: {} }) } }));

const author = { id: 'u1', displayName: 'Ethel', handle: null } as unknown as Comment['author'];
const c = (id: string, parentId: string | null = null, createdAt = '2026-10-29T00:00:00Z'): Comment => ({ id, parentId, body: `Comment ${id}`, isUpdate: false, createdAt, author });

function renderTree(comments: Comment[], highlightId: string | null = null) {
  return renderApp(
    <CommentTree
      comments={comments}
      tokens={vineTokens(null)}
      leavesShown={3}
      maxDepth={2}
      highlightId={highlightId}
      renderBody={(x, canReply) => (
        <Text>
          {x.body}
          {canReply ? ' [reply]' : ''}
        </Text>
      )}
    />,
  );
}

describe('Comment tree', () => {
  it('shows the newest leaves and fades the older ones into a blur until tapped', async () => {
    await renderTree(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => c(id)));
    expect(await screen.findByText('Comment f [reply]')).toBeTruthy();
    expect(screen.queryByText('Comment c [reply]')).toBeNull();
    fireEvent.press(screen.getByText('3 more leaves on this branch'));
    expect(await screen.findByText('Comment a [reply]')).toBeTruthy();
    expect(screen.queryByTestId('blur-root')).toBeNull();
  });

  it('grows side branches but offers no reply at the third level', async () => {
    await renderTree([c('a'), c('b', 'a'), c('x', 'b'), c('y', 'b')]);
    expect(await screen.findByText('Comment a [reply]')).toBeTruthy();
    expect(screen.getByText('Comment b [reply]')).toBeTruthy();
    expect(screen.getByText('Comment x')).toBeTruthy();
    expect(screen.getByText('Comment y')).toBeTruthy();
  });

  it('opens the branch that holds a shared comment', async () => {
    await renderTree(['a', 'b', 'c', 'd', 'e'].map((id) => c(id)), 'a');
    expect(await screen.findByText('Comment a [reply]')).toBeTruthy();
  });

  it('reads top to bottom, present to past', () => {
    const list = [c('old', null, '2026-10-28T10:00:00Z'), c('new', null, '2026-10-29T10:00:00Z'), c('mid', null, '2026-10-29T01:00:00Z')];
    expect(newestFirst(list).map((x) => x.id)).toEqual(['new', 'mid', 'old']);
  });

  it('hangs comments whose parent is gone from the request itself', () => {
    expect(branchesOf([c('a'), c('b', 'missing')]).get(null)?.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
