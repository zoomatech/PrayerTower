// Circle goals on a request: progress shows to everyone, the person who asked can set
// one, and Open Circle gets its own wording.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { CircleGoal } from '@/components/circle-goal';
import { api } from '@/lib/api';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { circleGoal: jest.fn(), setCircleGoal: jest.fn(), removeCircleGoal: jest.fn() } }));

const goal = { target: 50, endsAt: '2026-11-05T12:00:00Z', prayed: 12, met: false, ended: false };

afterEach(() => act(() => setWording('faith')));

describe('Circle goal', () => {
  it('shows progress without a set button to others', async () => {
    jest.mocked(api.circleGoal).mockResolvedValue({ enabled: true, canSet: false, goal });
    await renderApp(<CircleGoal postId="p1" />);
    expect(await screen.findByText('12 of 50 people have prayed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change goal' })).toBeNull();
  });

  it('lets the person who asked set a goal', async () => {
    jest.mocked(api.circleGoal).mockResolvedValue({ enabled: true, canSet: true, goal: null });
    jest.mocked(api.setCircleGoal).mockResolvedValue({ enabled: true, canSet: true, goal: { ...goal, prayed: 0 } });
    await renderApp(<CircleGoal postId="p1" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Set a circle goal' }));
    await fireEvent.changeText(screen.getByLabelText('How many people'), '50');
    await fireEvent.press(screen.getByRole('button', { name: 'Save goal' }));
    expect(api.setCircleGoal).toHaveBeenCalledWith('p1', 50, 7);
    expect(await screen.findByText('0 of 50 people have prayed')).toBeTruthy();
  });

  it('uses Open Circle wording', async () => {
    jest.mocked(api.circleGoal).mockResolvedValue({ enabled: true, canSet: false, goal });
    await act(() => setWording('neutral'));
    await renderApp(<CircleGoal postId="p1" />);
    expect(await screen.findByText('12 of 50 people have checked in')).toBeTruthy();
  });
});
