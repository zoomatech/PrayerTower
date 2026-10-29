// Kindness highlights screen: words only, and the writer says yes or no, or withdraws.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import HighlightsScreen from '@/app/highlights';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), kindnessHighlights: jest.fn(), highlightAsks: jest.fn(), answerHighlightAsk: jest.fn(), withdrawHighlight: jest.fn() } }));

it('shows the week’s words, and lets the writer say yes', async () => {
  jest.mocked(api.kindnessHighlights).mockResolvedValue({ enabled: true, weeks: [{ week: '2026-10-26', items: [{ id: 'h1', text: 'You are not alone.' }] }] });
  jest.mocked(api.highlightAsks).mockResolvedValue({ enabled: true, asks: [{ id: 'a1', status: 'asked', body: 'I will bring soup.', shownText: null }] });
  jest.mocked(api.answerHighlightAsk).mockResolvedValue({ enabled: true, asks: [{ id: 'a1', status: 'consented', body: 'I will bring soup.', shownText: null }] });
  await renderApp(<HighlightsScreen />);
  await act(async () => undefined);
  expect(await screen.findByText('“You are not alone.”')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText('Yes, share them')));
  expect(api.answerHighlightAsk).toHaveBeenCalledWith('a1', true);
  expect(screen.getByText(/You said yes/)).toBeTruthy();
  expect(screen.getByText('Withdraw')).toBeTruthy();
});
