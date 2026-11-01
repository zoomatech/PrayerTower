import type { FeedTheme } from '@prayer-tower/shared';

import { skinHeaderLook } from '../skin-header';

const theme = (layout: string, tokens: Record<string, unknown>) =>
  ({ slug: 's', name: 'S', layout, cardTemplates: {}, animations: {}, tokens }) as unknown as FeedTheme;

describe('skin header', () => {
  it('takes the skin backdrop and its own line color', () => {
    expect(skinHeaderLook(theme('vine', { backdrop: '#05070D', stem: '#2E9BFF' }))).toEqual({ backdrop: '#05070D', accent: '#2E9BFF' });
    expect(skinHeaderLook(theme('circuit', { backdrop: '#05070D', wire: '#00E5FF' }))).toEqual({ backdrop: '#05070D', accent: '#00E5FF' });
  });

  it('leaves the plain column and no skin with the plain header', () => {
    expect(skinHeaderLook(theme('column', {}))).toBeNull();
    expect(skinHeaderLook(null)).toBeNull();
  });
});
