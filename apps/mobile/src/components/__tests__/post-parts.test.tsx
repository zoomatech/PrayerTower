// Comments at block breaks (notebook Page 13): a long post in parts of about 200 words,
// each with "Comment on this part" and how many comments it already has.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { hasParts, PostParts } from '@/components/post-parts';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn().mockResolvedValue({ features: {} }) } }));

const sentence = (i: number) => `Day ${i} we sat in the waiting room and asked friends to keep us in their hearts.`;
const LONG = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(' ');

it('shows a short post whole', () => {
  expect(hasParts('Please pray for my mother.')).toBe(false);
  expect(hasParts(LONG)).toBe(true);
});

it('offers a comment after each part and says how many are there', async () => {
  const onPick = jest.fn();
  await renderApp(<PostParts body={LONG} style={{}} parts={{ counts: { 1: 2 }, picked: null, onPick }} />);
  const links = screen.getAllByText(/Comment on this part/);
  expect(links).toHaveLength(3);
  expect(screen.getByText('2 on this part')).toBeTruthy();
  fireEvent.press(links[2]!);
  expect(onPick).toHaveBeenCalledWith(2);
});
