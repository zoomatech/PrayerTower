// Mend screen: the author writes a three-part sorry for a moderator to read; the
// hurt person reads a delivered sorry and can accept it or close it quietly.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import MendScreen from '@/app/mend/[id]';
import { api, type Mend } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { mend: jest.fn(), writeSorry: jest.fn(), acceptMend: jest.fn(), closeMend: jest.fn() } }));

const base: Mend = { id: 'm1', role: 'author', status: 'invited', comment: { postId: 'p1', body: 'You should have known better.' }, author: null, sorry: null, canRevise: true, moderatorNote: null };

describe('Mend screen', () => {
  beforeEach(() => jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'm1' }));

  it('the author writes a three-part sorry for a moderator to read', async () => {
    jest.mocked(api.mend).mockResolvedValue({ mend: base });
    const sorry = { whatIDid: 'I said you should have known better.', onMe: 'It was on me.', nextTime: 'I will ask first.' };
    jest.mocked(api.writeSorry).mockResolvedValue({ mend: { ...base, status: 'review', canRevise: false, sorry } });
    await renderApp(<MendScreen />);
    await act(async () => undefined);
    const what = await screen.findByLabelText('What I did');
    await act(async () => fireEvent.changeText(what, sorry.whatIDid));
    await act(async () => fireEvent.changeText(screen.getByLabelText("That it's on me"), sorry.onMe));
    await act(async () => fireEvent.changeText(screen.getByLabelText("What I'll do differently"), sorry.nextTime));
    await act(async () => fireEvent.press(screen.getByText('Send for a moderator to read')));
    expect(api.writeSorry).toHaveBeenCalledWith('m1', sorry);
    expect(screen.getByText('A moderator is reading your sorry.')).toBeTruthy();
  });

  it('the hurt person reads a delivered sorry and can accept it', async () => {
    const sorry = { whatIDid: 'I was harsh.', onMe: 'That was on me.', nextTime: 'I will be gentler.' };
    const delivered: Mend = { ...base, role: 'hurt', status: 'delivered', author: { displayName: 'Sam' }, sorry, canRevise: false };
    jest.mocked(api.mend).mockResolvedValue({ mend: delivered });
    jest.mocked(api.acceptMend).mockResolvedValue({ mend: { ...delivered, status: 'accepted' } });
    await renderApp(<MendScreen />);
    await act(async () => undefined);
    expect(await screen.findByText('A sorry from Sam')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Accept')));
    expect(screen.getByText('You accepted this sorry.')).toBeTruthy();
  });
});
