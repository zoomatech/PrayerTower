// Comment tree (Admin → Feed skins): comments as leaves on branches. A branch shows
// a few leaves and the rest wait in a faded blur until tapped; no reply link at
// the deepest level, so a chain can't keep going.
import type { Comment } from '@prayer-tower/shared';
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { CommentTree, branchesOf } from '@/components/comment-tree';
import { vineTokens } from '@/layouts/vine';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn().mockResolvedValue({ features: {} }) } }));

const author = { id: 'u1', displayName: 'Ethel', handle: null } as unknown as Comment['author'];
const c = (id: string, parentId: string | null = null): Comment => ({ id, parentId, body: `Comment ${id}`, isUpdate: false, createdAt: '2026-10-29T00:00:00Z', author });

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
  it('shows a few leaves and fades the rest into a blur until tapped', async () => {
    await renderTree(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => c(id)));
    expect(await screen.findByText('Comment a [reply]')).toBeTruthy();
    expect(screen.queryByText('Comment d [reply]')).toBeNull();
    fireEvent.press(screen.getByText('3 more leaves on this branch'));
    expect(await screen.findByText('Comment f [reply]')).toBeTruthy();
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
    await renderTree(['a', 'b', 'c', 'd', 'e'].map((id) => c(id)), 'e');
    expect(await screen.findByText('Comment e [reply]')).toBeTruthy();
  });

  it('hangs comments whose parent is gone from the request itself', () => {
    expect(branchesOf([c('a'), c('b', 'missing')]).get(null)?.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
