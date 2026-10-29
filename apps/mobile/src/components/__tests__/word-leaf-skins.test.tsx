// Emoji word leaves take the member's feed skin: flowers, stars, stone tablets or neon.
import type { FeedTheme } from '@prayer-tower/shared';
import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { Leaf, wordLeafTokens } from '@/components/meaning-reactions';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(async () => ({ features: {} })) } }));

const theme = (layout: FeedTheme['layout'], tokens: Record<string, unknown>): FeedTheme => ({ slug: 's', name: 'S', layout, cardTemplates: {}, animations: {}, tokens });

describe('wordLeafTokens', () => {
  it('follows each skin, and leaves plain layouts alone', () => {
    expect(wordLeafTokens(theme('vine', { leaf: '#F48FB1', leafShape: 'flower' }))).toMatchObject({ leaf: '#F48FB1', leafShape: 'flower' });
    expect(wordLeafTokens(theme('tower', { stone: '#B9AE9C', mortar: '#8F8574' }))).toMatchObject({ leaf: '#B9AE9C', branch: '#8F8574', leafShape: 'tablet' });
    expect(wordLeafTokens(theme('circuit', { screen: '#FF2BD6', wire: '#00E5FF' }))).toMatchObject({ leaf: '#FF2BD6', branch: '#00E5FF' });
    expect(wordLeafTokens(theme('column', {}))).toBeUndefined();
    expect(wordLeafTokens(null)).toBeUndefined();
  });
});

describe('Leaf', () => {
  it('draws a stone tablet on the tower, outlined in mortar', async () => {
    await renderApp(<Leaf icon="💪" label="Feel better" count={1} mine={false} tokens={wordLeafTokens(theme('tower', { stone: '#B9AE9C', mortar: '#8F8574' }))} />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style).toMatchObject({ borderColor: '#8F8574', borderRadius: 3 });
  });

  it('keeps the skin colors on your own leaf, with a heavier outline', async () => {
    await renderApp(<Leaf icon="💪" label="Feel better" count={1} mine tokens={{ leaf: '#F48FB1', leafSoft: '#FFF0F5', leafShape: 'flower' }} />);
    expect(StyleSheet.flatten(screen.getByRole('button').props.style)).toMatchObject({ backgroundColor: '#FFF0F5', borderColor: '#F48FB1', borderWidth: 2.5 });
  });
});
