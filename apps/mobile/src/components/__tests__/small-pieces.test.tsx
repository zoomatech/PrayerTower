// Small shared pieces: the town field on Me, the crisis support box and the offline banner.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import { renderApp } from '@/__tests__/helpers';
import { CrisisSupport } from '@/components/crisis';
import { OfflineBanner } from '@/components/offline-banner';
import { TownField } from '@/components/town-field';
import { dismissDropped, useOffline } from '@/lib/offline';

jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => true) }));
jest.mock('@/lib/offline', () => ({ useOffline: jest.fn(), dismissDropped: jest.fn() }));

const offline = (state: Partial<ReturnType<typeof useOffline>>) =>
  jest.mocked(useOffline).mockReturnValue({ online: true, queued: [], dropped: [], ...state } as ReturnType<typeof useOffline>);

describe('TownField', () => {
  it('saves the town without extra spaces', async () => {
    const onSave = jest.fn(async () => undefined);
    await renderApp(<TownField town={null} onSave={onSave} />);
    expect(screen.queryByRole('button', { name: 'Save town' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Your town (optional)'), '  Albuquerque ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save town' }));
    expect(onSave).toHaveBeenCalledWith('Albuquerque');
  });

  it('clears the town when emptied', async () => {
    const onSave = jest.fn(async () => undefined);
    await renderApp(<TownField town="Albuquerque" onSave={onSave} />);
    await fireEvent.changeText(screen.getByLabelText('Your town (optional)'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save town' }));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});

describe('CrisisSupport', () => {
  it('shows the 988 line and opens each way to reach it', async () => {
    await renderApp(<CrisisSupport />);
    expect(screen.getByText(/988 Suicide & Crisis Lifeline is free/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Call 988' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Text 988' }));
    expect(Linking.openURL).toHaveBeenCalledWith('tel:988');
    expect(Linking.openURL).toHaveBeenCalledWith('sms:988');
  });
});

describe('OfflineBanner', () => {
  it('shows nothing while online with nothing waiting', async () => {
    offline({});
    await renderApp(<OfflineBanner />);
    expect(screen.queryByText(/offline/)).toBeNull();
  });

  it('says how many actions are waiting while offline', async () => {
    offline({ online: false, queued: [{}, {}] as never });
    await renderApp(<OfflineBanner />);
    expect(screen.getByText(/You're offline\. 2 actions are waiting to send\./)).toBeTruthy();
  });

  it('lists what the server turned down and lets the member dismiss it', async () => {
    offline({ dropped: [{ label: 'Your post', message: '"Hello"' }] });
    await renderApp(<OfflineBanner />);
    expect(screen.getByText('Not sent: Your post: "Hello"')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(dismissDropped).toHaveBeenCalled());
  });
});
