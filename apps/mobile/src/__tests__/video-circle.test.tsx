// Video circles on the Mend screen: hidden while off, a yes or no for whoever is asked,
// the room only once it's ready, and an offer form for moderators.
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import { VideoCircleCard } from '@/components/video-circle';
import { api, type VideoCircle } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/api', () => ({
  ApiError: jest.requireActual('@/lib/api').ApiError,
  api: {
    features: jest.fn(),
    videoCircle: jest.fn(),
    answerVideoCircle: jest.fn(),
    offerVideoCircle: jest.fn(),
    endVideoCircle: jest.fn(),
  },
}));

const on = (features: object) => jest.mocked(api.features).mockResolvedValue({ features } as unknown as Awaited<ReturnType<typeof api.features>>);
const circle = (extra: Partial<VideoCircle> = {}): VideoCircle => ({
  id: 'v1',
  role: 'hurt',
  status: 'asked_hurt',
  note: 'Fifteen minutes, just to listen.',
  questions: ['What did you think when you realized what had happened?'],
  canAnswer: true,
  roomUrl: null,
  ...extra,
});

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.videoCircle).mockReset();
  jest.mocked(api.answerVideoCircle).mockReset();
  jest.mocked(api.offerVideoCircle).mockReset();
});

describe('VideoCircleCard', () => {
  it('shows nothing while switched off', async () => {
    on({});
    await renderApp(<VideoCircleCard mendId="m1" staff />);
    expect(screen.queryByTestId('video-circle')).toBeNull();
    expect(screen.queryByTestId('video-circle-offer')).toBeNull();
    expect(api.videoCircle).not.toHaveBeenCalled();
  });

  it('asks the hurt person, then waits for the author', async () => {
    on({ videoCircles: true });
    jest.mocked(api.videoCircle).mockResolvedValue({ circle: circle() });
    jest.mocked(api.answerVideoCircle).mockResolvedValue({
      circle: circle({ status: 'asked_author', canAnswer: false }),
    });
    await renderApp(<VideoCircleCard mendId="m1" />);
    expect(await screen.findByText(/They won’t hear about it unless you say yes/)).toBeTruthy();
    expect(screen.getByText('From the moderator: Fifteen minutes, just to listen.')).toBeTruthy();
    expect(screen.getByText(/What did you think/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Yes, I’d like that')));
    expect(api.answerVideoCircle).toHaveBeenCalledWith('v1', true);
    expect(await screen.findByText(/We asked them/)).toBeTruthy();
  });

  it('opens the room once it is ready', async () => {
    on({ videoCircles: true });
    jest.mocked(api.videoCircle).mockResolvedValue({
      circle: circle({
        status: 'ready',
        canAnswer: false,
        roomUrl: 'https://meet.example.org/PrayerTower-x',
      }),
    });
    await renderApp(<VideoCircleCard mendId="m1" />);
    await act(async () => fireEvent.press(await screen.findByText('Open the circle')));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://meet.example.org/PrayerTower-x');
    expect(screen.queryByText('End the circle')).toBeNull();
  });

  it('lets a moderator offer one, and says kindly when a member said no', async () => {
    on({ videoCircles: true });
    jest.mocked(api.videoCircle).mockResolvedValue({ circle: null });
    jest.mocked(api.offerVideoCircle).mockResolvedValue({
      circle: circle({ role: 'moderator', canAnswer: false }),
    });
    await renderApp(<VideoCircleCard mendId="m1" staff />);
    await fireEvent.changeText(await screen.findByPlaceholderText('A few words to both of them (optional)'), 'Just to listen.');
    await act(async () => fireEvent.press(screen.getAllByText('Offer a video circle')[1]!));
    expect(api.offerVideoCircle).toHaveBeenCalledWith('m1', 'Just to listen.');
    expect(await screen.findByText('Waiting for the hurt person to answer.')).toBeTruthy();
  });

  it('tells a member when the circle will not happen', async () => {
    on({ videoCircles: true });
    jest.mocked(api.videoCircle).mockResolvedValue({
      circle: circle({ status: 'declined', canAnswer: false }),
    });
    await renderApp(<VideoCircleCard mendId="m1" />);
    expect(await screen.findByText('The circle won’t happen. That’s okay.')).toBeTruthy();
  });
});
