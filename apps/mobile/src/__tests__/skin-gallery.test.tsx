// Me → Skin gallery: previews, likes and "Use this skin".
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import SkinGallery from '@/app/skin-gallery';
import { api, type GallerySkin } from '@/lib/api';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(async () => ({ features: {} })), skinGallery: jest.fn(), likeSkin: jest.fn(), chooseFeedTheme: jest.fn() } }));

const skin = (over: Partial<GallerySkin>): GallerySkin => ({ slug: 'beanstalk', name: 'Beanstalk', layout: 'vine', season: null, tokens: { stem: '#4F8A2E' }, maker: null, likes: 0, liked: false, inUse: false, ...over });

it('lists skins with their maker, likes one, and puts one on', async () => {
  jest.mocked(api.skinGallery).mockResolvedValue({ skins: [skin({ slug: 'rose', name: 'Rose Window', maker: { id: 'u1', name: 'Ruth' }, likes: 2 }), skin({ inUse: true })] });
  jest.mocked(api.likeSkin).mockResolvedValue({ skins: [skin({ slug: 'rose', name: 'Rose Window', maker: { id: 'u1', name: 'Ruth' }, likes: 3, liked: true })] });
  jest.mocked(api.chooseFeedTheme).mockResolvedValue({ themes: [], current: 'rose' });
  await renderApp(<SkinGallery />);
  expect(await screen.findByText('by Ruth')).toBeTruthy();
  expect(screen.getByText('You’re using this skin')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Like Rose Window, 2 likes'));
  await waitFor(() => expect(api.likeSkin).toHaveBeenCalledWith('rose', true));
  expect(await screen.findByLabelText('Unlike Rose Window, 3 likes')).toBeTruthy();
  fireEvent.press(screen.getByText('Use this skin'));
  await waitFor(() => expect(api.chooseFeedTheme).toHaveBeenCalledWith('rose'));
});

it('shows Open Circle names for built-in skins, and keeps a member skin’s own name', async () => {
  await act(() => setWording('neutral'));
  try {
    jest.mocked(api.skinGallery).mockResolvedValue({ skins: [skin({ slug: 'swipe', name: 'Swipe to pray', layout: 'carousel' }), skin({ slug: 'mine', name: 'Swipe to pray', maker: { id: 'u1', name: 'Ruth' } })] });
    await renderApp(<SkinGallery />);
    expect(await screen.findByText('Swipe through')).toBeTruthy();
    expect(screen.getByLabelText('Like Swipe through, 0 likes')).toBeTruthy();
    expect(screen.getByText('Swipe to pray')).toBeTruthy();
  } finally {
    await act(() => setWording('faith'));
  }
});
