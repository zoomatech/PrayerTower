import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import LibraryScreen from '@/app/library';
import MyNotesScreen from '@/app/my-notes';
import WordStudyScreen from '@/app/word-study';
import { api, type LibraryNote } from '@/lib/api';
import { router, useLocalSearchParams } from 'expo-router';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]),
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/lib/api', () => ({
  api: { library: jest.fn(), searchLibrary: jest.fn(), wordVerse: jest.fn(), wordEntry: jest.fn(), libraryNotes: jest.fn(), saveLibraryNote: jest.fn(), circleLibraryNotes: jest.fn(), myCircles: jest.fn() },
}));
let mockFeatures = { libraryWords: true, libraryNotes: true, prayerCircles: true };
jest.mock('@/lib/features', () => ({ useFeatures: () => mockFeatures }));

const KEY = 'c'.repeat(32);
const note = (over: Partial<LibraryNote> = {}): LibraryNote => ({
  id: 'n1',
  collection: 'bible-kjv',
  workId: 'kjv-psalms',
  ref: 'Psalms 23:1',
  key: KEY,
  quote: 'The LORD is my shepherd; I shall not want.',
  citation: 'Psalms 23:1 (King James Bible)',
  color: 'yellow',
  note: 'Read at Gran’s funeral.',
  circle: null,
  updatedAt: '2026-10-29T23:00:00Z',
  ...over,
});

beforeEach(() => {
  mockFeatures = { libraryWords: true, libraryNotes: true, prayerCircles: true };
  jest.mocked(router.push).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(api.myCircles).mockResolvedValue({ enabled: true, circles: [{ id: 'c1', name: 'Study group', about: null, isOwner: true, members: 3, lastPostAt: null }] });
  jest.mocked(api.libraryNotes).mockResolvedValue({ notes: [] });
});

// The first test in this file loads the library screens cold; on a busy CI runner that alone
// can pass Jest's 5 second default, so give each test here more room.
jest.setTimeout(20000);

describe('Word study', () => {
  it('shows a verse word by word and opens a word', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ ref: 'Genesis 1:1' });
    jest.mocked(api.wordVerse).mockResolvedValue({
      ref: 'Genesis 1:1',
      citation: 'Genesis 1:1 (King James Bible)',
      key: KEY,
      words: [{ text: 'In the ', strongs: [] }, { text: 'beginning', strongs: ['H7225'] }],
      roots: { H7225: { lemma: 'רֵאשִׁית', translit: 'rêʼshîyth' } },
    });
    await renderApp(<WordStudyScreen />);
    expect(await screen.findByText('Genesis 1:1 (King James Bible)')).toBeTruthy();
    expect(screen.getByText('rêʼshîyth')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('beginning: rêʼshîyth (H7225)'));
    expect(router.push).toHaveBeenCalledWith('/word-study?id=H7225');
  });

  it('shows a word’s meaning and pages through the verses that use it', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'G26' });
    const verse = (ref: string) => ({ ref, text: 'Charity suffereth long, and is kind.', as: ['Charity'], citation: `${ref} (King James Bible)`, key: KEY });
    const entry = { id: 'G26', language: 'Greek' as const, lemma: 'ἀγάπη', translit: 'agápē', pron: 'ag-ah\'-pay', derivation: 'from G25;', definition: 'love, i.e. affection or benevolence', kjv: '(feast of) charity(-ably), dear, love.', total: 2 };
    jest.mocked(api.wordEntry).mockResolvedValueOnce({ ...entry, verses: [verse('1 Corinthians 13:4')] }).mockResolvedValueOnce({ ...entry, verses: [verse('1 Corinthians 13:8')] });
    await renderApp(<WordStudyScreen />);
    expect(await screen.findByText('ἀγάπη · agápē')).toBeTruthy();
    expect(screen.getByText('love, i.e. affection or benevolence')).toBeTruthy();
    expect(screen.getByText('Used in 2 verses')).toBeTruthy();
    expect(screen.getByText('Here: Charity')).toBeTruthy();
    await fireEvent.press(screen.getByText('Show more'));
    expect(await screen.findByText('1 Corinthians 13:8')).toBeTruthy();
    expect(api.wordEntry).toHaveBeenLastCalledWith('G26', 1, 20);
    await fireEvent.press(screen.getByLabelText('Study the words of 1 Corinthians 13:8'));
    expect(router.push).toHaveBeenCalledWith('/word-study?ref=1%20Corinthians%2013%3A8');
  });
});

describe('Highlights and notes', () => {
  it('highlights a search result, writes a note and shares it with a circle', async () => {
    jest.mocked(api.library).mockResolvedValue({ enabled: true, collections: [{ id: 'bible-kjv', title: 'King James Bible', faith: true }] });
    jest.mocked(api.searchLibrary).mockResolvedValue({ total: 1, source: 'Project Gutenberg', hits: [{ ref: 'Psalms 23:1', text: 'The LORD is my shepherd; I shall not want.', complete: true, work: { id: 'kjv-psalms', title: 'Psalms', author: '' }, citation: 'Psalms 23:1 (King James Bible)', key: KEY }] });
    jest.mocked(api.saveLibraryNote).mockResolvedValue({ note: note({ circle: { id: 'c1', name: 'Study group' } }) });
    await renderApp(<LibraryScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Words to find'), 'shepherd');
    await fireEvent.press(screen.getByText('Search'));
    await fireEvent.press(await screen.findByLabelText('Highlight or add a note to Psalms 23:1 (King James Bible)'));
    await fireEvent.press(screen.getByText('Yellow'));
    await fireEvent.changeText(screen.getByLabelText('Your note'), 'Read at Gran’s funeral.');
    await fireEvent.press(screen.getByText('Study group'));
    await fireEvent.press(screen.getByText('Save'));
    expect(api.saveLibraryNote).toHaveBeenCalledWith({ collection: 'bible-kjv', key: KEY, color: 'yellow', note: 'Read at Gran’s funeral.', circleId: 'c1' });
    expect(await screen.findByText('Your note, shared with Study group')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Study the words of Psalms 23:1'));
    expect(router.push).toHaveBeenCalledWith('/word-study?ref=Psalms%2023%3A1');
  });

  it('hides the buttons while the switches are off', async () => {
    mockFeatures = { libraryWords: false, libraryNotes: false, prayerCircles: false };
    jest.mocked(api.library).mockResolvedValue({ enabled: true, collections: [{ id: 'bible-kjv', title: 'King James Bible', faith: true }] });
    jest.mocked(api.searchLibrary).mockResolvedValue({ total: 1, source: 'Project Gutenberg', hits: [{ ref: 'Psalms 23:1', text: 'The LORD is my shepherd.', complete: true, work: { id: 'kjv-psalms', title: 'Psalms', author: '' }, citation: 'Psalms 23:1 (King James Bible)', key: KEY }] });
    await renderApp(<LibraryScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Words to find'), 'shepherd');
    await fireEvent.press(screen.getByText('Search'));
    expect(await screen.findByText('Psalms 23:1')).toBeTruthy();
    expect(screen.queryByText('Highlight or note')).toBeNull();
    expect(screen.queryByText('Study the words')).toBeNull();
    expect(api.libraryNotes).not.toHaveBeenCalled();
  });

  it('lists my notes, and the notes shared in a circle with who wrote them', async () => {
    jest.mocked(api.libraryNotes).mockResolvedValue({ notes: [note()] });
    await renderApp(<MyNotesScreen />);
    expect(await screen.findByText('Psalms 23:1 (King James Bible)')).toBeTruthy();
    expect(screen.getByText('Your note (only you)')).toBeTruthy();
    await fireEvent.press(await screen.findByText('Shared in Study group'));
    expect(router.push).toHaveBeenCalledWith('/my-notes?circle=c1');

    jest.mocked(useLocalSearchParams).mockReturnValue({ circle: 'c1' });
    jest.mocked(api.circleLibraryNotes).mockResolvedValue({ notes: [{ ...note({ note: 'For Sunday.', circle: { id: 'c1', name: 'Study group' } }), author: 'Ruth', mine: false }] });
    await renderApp(<MyNotesScreen />);
    expect(await screen.findByText('For Sunday.')).toBeTruthy();
    expect(screen.getByText('Ruth')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Shared in Study group')).toBeTruthy());
  });
});
