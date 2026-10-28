// Members listening to staff podcasts.
import { fireEvent, screen } from '@testing-library/react-native';
import { useAudioPlayer } from 'expo-audio';

import { renderApp } from '@/__tests__/helpers';
import Podcasts from '@/app/podcasts';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { podcasts: jest.fn() } }));

const episode = { id: 'e1', guid: 'g1', title: 'Day 1: Be still', description: 'Psalm 46', audioUrl: 'https://cdn.example/ep1.mp3', audioBytes: 1, audioType: 'audio/mpeg', durationSeconds: 600, episodeNumber: 1, publishedAt: '2026-10-28T12:00:00Z' };

it('lists episodes and plays one', async () => {
  (api.podcasts as jest.Mock).mockResolvedValue({ shows: [{ id: 's1', slug: 'morning', community: null, title: 'Morning Prayer', description: 'Ten minutes.', author: 'Prayer Tower', imageUrl: null, category: 'Religion & Spirituality', published: true, episodes: [episode] }] });
  await renderApp(<Podcasts />);
  expect(await screen.findByText('Morning Prayer')).toBeTruthy();
  expect(screen.getByText(/10 min/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Play Day 1: Be still' }));
  expect(screen.getByText('Now playing')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
  expect(useAudioPlayer({ uri: '' }).play).toHaveBeenCalled();
});

it('says when there is nothing yet', async () => {
  (api.podcasts as jest.Mock).mockResolvedValue({ shows: [] });
  await renderApp(<Podcasts />);
  expect(await screen.findByText('No episodes yet.')).toBeTruthy();
});
