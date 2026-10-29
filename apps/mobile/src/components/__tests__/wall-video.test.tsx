// The full-screen wall: a video plays by itself (muted, looping) only on the page that is on screen.
import { screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { CardMedia, WallPage } from '@/components/media';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(async () => ({ features: { videoMaxSeconds: 7 } })) } }));
jest.mock('expo-video', () => {
  const player = { play: jest.fn(), loop: false, muted: false, currentTime: 0, timeUpdateEventInterval: 0, addListener: jest.fn(() => ({ remove: jest.fn() })) };
  return { useVideoPlayer: jest.fn((_url: string, setup: (p: typeof player) => void) => (setup(player), player)), VideoView: () => null, __player: player };
});
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEventListener: jest.fn() }));

const media = [{ kind: 'video' as const, storagePath: 'v/1.mp4', url: 'https://example.test/1.mp4' }];

describe('wall video', () => {
  it('plays muted and looping on the page on screen', async () => {
    await renderApp(
      <WallPage.Provider value={{ active: true }}>
        <CardMedia media={media as never} expanded={false} />
      </WallPage.Provider>,
    );
    expect(await screen.findByTestId('wall-video-playing')).toBeTruthy();
    const player = jest.requireMock('expo-video').__player;
    expect(player.loop).toBe(true);
    expect(player.muted).toBe(true);
    expect(player.play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Turn the sound on' })).toBeTruthy();
  });

  it('waits behind a play button on pages off screen', async () => {
    await renderApp(
      <WallPage.Provider value={{ active: false }}>
        <CardMedia media={media as never} expanded={false} />
      </WallPage.Provider>,
    );
    expect(await screen.findByTestId('wall-video')).toBeTruthy();
    expect(screen.queryByTestId('wall-video-playing')).toBeNull();
  });
});
