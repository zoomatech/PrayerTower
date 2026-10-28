// Macro needs above the feed (pray and give material help) and this week's highlights.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { Highlights } from '@/components/highlights';
import { MacroNeeds } from '@/components/macro-needs';
import { type MacroNeed } from '@/lib/api';
import { setWording } from '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/api', () => ({ api: { features: jest.fn(async () => ({ features: {} })) } }));

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church\w*|amen|blessed|scripture|priestly|pastor\w*|testimon\w*|prais\w*)\b/i;

const need = (over: Partial<MacroNeed> = {}): MacroNeed => ({
  id: 'n1',
  title: 'Hurricane relief',
  helpOptions: [{ label: 'Red Cross', url: 'https://www.redcross.org/donate' }],
  endsAt: null,
  card: sampleCard({ preview: 'Families on the coast lost their homes.' }),
  prayers: 12,
  tokens: 30,
  helpers: 4,
  helped: false,
  ...over,
});

afterEach(() => act(() => setWording('faith')));

describe('MacroNeeds', () => {
  it('lets a member pray, give and say they helped', async () => {
    const onAction = jest.fn();
    const onHelped = jest.fn();
    const n = need();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderApp(<MacroNeeds needs={[n]} onAction={onAction} onHelped={onHelped} />);
    expect(screen.getByText('12 praying · 30 tokens given · 4 gave material help')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Praying now' }));
    expect(onAction).toHaveBeenCalledWith(n.card, 'praying_now');
    await fireEvent.press(screen.getByRole('button', { name: 'Red Cross ↗' }));
    expect(Linking.openURL).toHaveBeenCalledWith('https://www.redcross.org/donate');
    await fireEvent.press(screen.getByRole('button', { name: 'I gave material help' }));
    expect(onHelped).toHaveBeenCalledWith('n1');
  });

  it('thanks a member who already helped', async () => {
    await renderApp(<MacroNeeds needs={[need({ helped: true })]} onAction={jest.fn()} onHelped={jest.fn()} />);
    expect(screen.getByText('Thank you for helping.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'I gave material help' })).toBeNull();
  });

  it('has no religious words in Open Circle wording', async () => {
    await act(() => setWording('neutral'));
    await renderApp(<MacroNeeds needs={[need({ title: 'Flood relief' })]} onAction={jest.fn()} onHelped={jest.fn()} />);
    expect(screen.getByText('12 thinking of them · 30 tokens given · 4 gave material help')).toBeTruthy();
    expect(screen.queryByText(RELIGIOUS)).toBeNull();
  });
});

describe('Highlights', () => {
  it('ranks the most-prayed requests and top pray-ers, and opens a request', async () => {
    const card = sampleCard({ preview: 'Pray for my mother' });
    await renderApp(
      <Highlights
        data={{ days: 7, topPrayers: [{ prayers: 9, card }], topWarriors: [{ id: 'u1', displayName: 'Ruth', prayers: 14 }, { id: null, displayName: '', prayers: 3 }] }}
      />,
    );
    expect(screen.getByText('1. Ruth')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('2. Anonymous prayer warrior')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: /Pray for my mother/ }));
    expect(router.push).toHaveBeenCalledWith(`/post/${card.id}`);
  });

  it('says when there is nothing yet', async () => {
    await renderApp(<Highlights data={{ days: 7, topPrayers: [], topWarriors: [] }} />);
    expect(screen.getByText('No prayers yet this week.')).toBeTruthy();
    expect(screen.getByText('Be the first to pray this week.')).toBeTruthy();
  });
});
