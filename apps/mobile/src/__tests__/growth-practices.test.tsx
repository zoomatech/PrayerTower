// Growth practices: the author's "Share how it's going?" card (with "Prefer not to
// say"), and the private weekly "Three good things" card. Nothing shows while off.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import RememberedScreen from '@/app/remembered';
import { EncouragerCard } from '@/components/encourager-card';
import { FollowupCard } from '@/components/followup-card';
import { GratitudeCard } from '@/components/gratitude-card';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(),
    followup: jest.fn(),
    answerFollowup: jest.fn(),
    gratitude: jest.fn(),
    saveGratitude: jest.fn(),
    setGratitudeDay: jest.fn(), encourager: jest.fn(), askForEncourager: jest.fn(), endEncouragerMatch: jest.fn(), encouragerCheckIn: jest.fn(), setVolunteer: jest.fn(), remembered: jest.fn(), hideRemembered: jest.fn(),
  },
}));

const on = (f: { followupNudge?: boolean; gratitudeCard?: boolean; encourager?: boolean; remembered?: boolean }) =>
  jest.mocked(api.features).mockResolvedValue({
    features: { followupNudge: false, gratitudeCard: false, ...f },
  } as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.followup).mockResolvedValue({ enabled: true, pending: true });
  jest.mocked(api.gratitude).mockResolvedValue({
    enabled: true,
    weekday: null,
    weekStart: '2026-10-26',
    items: [],
  });
});

describe('Share how it is going', () => {
  it('shows nothing while off, or to anyone but the author', async () => {
    on({});
    await renderApp(<FollowupCard postId="p1" isMine />);
    expect(screen.queryByTestId('followup-card')).toBeNull();
    on({ followupNudge: true });
    resetFeatures();
    await renderApp(<FollowupCard postId="p1" isMine={false} />);
    expect(screen.queryByTestId('followup-card')).toBeNull();
    expect(api.followup).not.toHaveBeenCalled();
  });

  it('a grateful update sends the words; prefer-not-to-say closes it quietly', async () => {
    on({ followupNudge: true });
    jest.mocked(api.answerFollowup).mockResolvedValue({ answer: 'grateful', crisis: false });
    await renderApp(<FollowupCard postId="p1" isMine />);
    const grateful = await screen.findByTestId('followup-grateful');
    await act(async () => fireEvent.press(grateful));
    const words = await screen.findByPlaceholderText('A few words for the people who prayed (optional)');
    await act(async () => fireEvent.changeText(words, 'It went well.'));
    expect(screen.getByDisplayValue('It went well.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Share')));
    expect(api.answerFollowup).toHaveBeenCalledWith('p1', 'grateful', 'It went well.');
    expect(screen.getByText('Thank you for letting them know.')).toBeTruthy();
  });

  it('prefer not to say', async () => {
    on({ followupNudge: true });
    jest.mocked(api.answerFollowup).mockResolvedValue({ answer: 'private', crisis: false });
    await renderApp(<FollowupCard postId="p2" isMine />);
    const quiet = await screen.findByTestId('followup-private');
    await act(async () => fireEvent.press(quiet));
    expect(api.answerFollowup).toHaveBeenCalledWith('p2', 'private', undefined);
    expect(screen.getByText("That's okay. Nothing was shared.")).toBeTruthy();
  });
});

describe('Three good things', () => {
  it('shows nothing while off', async () => {
    on({});
    await renderApp(<GratitudeCard />);
    expect(screen.queryByTestId('gratitude-card')).toBeNull();
  });

  it('saves up to three good things, picks a day, and can share them as a praise', async () => {
    on({ gratitudeCard: true });
    jest.mocked(api.saveGratitude).mockResolvedValue({
      enabled: true,
      weekday: null,
      weekStart: '2026-10-26',
      items: ['A long walk'],
    });
    jest.mocked(api.setGratitudeDay).mockResolvedValue({
      enabled: true,
      weekday: 5,
      weekStart: '2026-10-26',
      items: ['A long walk'],
    });
    await renderApp(<GratitudeCard />);
    await screen.findByTestId('gratitude-card');
    await act(async () => fireEvent.changeText(screen.getAllByLabelText('Good thing 1')[0]!, 'A long walk'));
    await act(async () => fireEvent.press(screen.getByText('Save')));
    expect(api.saveGratitude).toHaveBeenCalledWith(['A long walk'], expect.any(String));
    expect(screen.getByText('Saved. Well noticed.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Fri')));
    expect(api.setGratitudeDay).toHaveBeenCalledWith(5, expect.any(String));
    fireEvent.press(screen.getByText('Share as a praise'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/compose',
      params: { type: 'praise', body: 'A long walk' },
    });
  });
});

describe('Encourager', () => {
  const match = { id: 'm1', role: 'newcomer' as const, other: { id: 'u2', displayName: 'Carol' }, endsAt: '2026-11-28T00:00:00.000Z' };
  it('a newcomer asks, sees their encourager, and can end it', async () => {
    on({ encourager: true });
    jest.mocked(api.encourager).mockResolvedValue({ enabled: true, volunteer: false, canAsk: true, matches: [] });
    jest.mocked(api.askForEncourager).mockResolvedValue({ enabled: true, volunteer: false, canAsk: false, matches: [match], matched: true });
    jest.mocked(api.endEncouragerMatch).mockResolvedValue({ enabled: true, volunteer: false, canAsk: true, matches: [] });
    await renderApp(<EncouragerCard />);
    const ask = await screen.findByText('Ask for an encourager');
    await act(async () => fireEvent.press(ask));
    expect(screen.getByText('Your encourager: Carol')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('encourager-end-m1')));
    expect(api.endEncouragerMatch).toHaveBeenCalledWith('m1');
    expect(screen.queryByText('Your encourager: Carol')).toBeNull();
  });

  it('asks the two-week check-in privately, and a change ends the pairing', async () => {
    on({ encourager: true });
    jest.mocked(api.encourager).mockResolvedValue({ enabled: true, volunteer: false, canAsk: false, matches: [{ ...match, checkInDue: true }] });
    jest.mocked(api.encouragerCheckIn).mockResolvedValue({ enabled: true, volunteer: false, canAsk: true, matches: [] });
    await renderApp(<EncouragerCard />);
    expect(await screen.findByText('Two weeks in: how is it going?')).toBeTruthy();
    expect(screen.getByText('Only you see your answer.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('I’d like a change')));
    expect(api.encouragerCheckIn).toHaveBeenCalledWith('m1', 'change');
    expect(screen.queryByText('Two weeks in: how is it going?')).toBeNull();
    expect(screen.getByText('Ask for an encourager')).toBeTruthy();
  });

  it('volunteering needs the guidelines agreed first', async () => {
    on({ encourager: true });
    jest.mocked(api.encourager).mockResolvedValue({ enabled: true, volunteer: false, canAsk: false, matches: [] });
    jest.mocked(api.setVolunteer).mockResolvedValue({ enabled: true, volunteer: true, canAsk: false, matches: [] });
    await renderApp(<EncouragerCard />);
    const volunteer = await screen.findByText('Volunteer as an encourager');
    await act(async () => fireEvent.press(volunteer));
    expect(api.setVolunteer).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByText('I agree to follow the community rules and to encourage, never pressure.')));
    await act(async () => fireEvent.press(screen.getByText('Volunteer as an encourager')));
    expect(api.setVolunteer).toHaveBeenCalledWith(true, true);
    expect(screen.getByText("You're a volunteer encourager. Thank you.")).toBeTruthy();
  });
});

describe('Answered & remembered', () => {
  it('lists grateful answered requests and hides one', async () => {
    const item = { id: 'p9', body: 'Please pray for my job interview.', testimony: 'I got the job!', answeredAt: '2026-10-01T12:00:00.000Z' };
    jest.mocked(api.remembered).mockResolvedValue({ enabled: true, items: [item] });
    jest.mocked(api.hideRemembered).mockResolvedValue({ enabled: true, items: [] });
    await renderApp(<RememberedScreen />);
    expect(await screen.findByText('I got the job!')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Hide this')));
    expect(api.hideRemembered).toHaveBeenCalledWith('p9');
    expect(screen.getByText('When you share a grateful update on an answered request, it will be kept here.')).toBeTruthy();
  });
});
