import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { DailyPassage, sharedPassage } from '@/components/daily-passage';
import LibraryScreen from '@/app/library';
import { api } from '@/lib/api';
import { router } from 'expo-router';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, []) }));
jest.mock('@/lib/api', () => ({ api: { library: jest.fn(), searchLibrary: jest.fn(), libraryDaily: jest.fn() } }));
let mockFeatures = { libraryShare: false, libraryDaily: false };
jest.mock('@/lib/features', () => ({ useFeatures: () => mockFeatures }));

const psalm = { ref: 'Psalms 23:1', text: 'The LORD is my shepherd; I shall not want.', complete: true, work: { id: 'kjv-psalms', title: 'Psalms', author: '' }, citation: 'Psalms 23:1 (King James Bible)' };
const tale = { ref: 'Introduction', text: 'Gilgamesh and Enkidu meet.', complete: false, work: { id: 'gilgamesh-old-babylonian', title: 'An Old Babylonian Version of the Gilgamesh Epic', author: '' }, citation: 'An Old Babylonian Version of the Gilgamesh Epic, Introduction' };

describe('Search the texts', () => {
  beforeEach(() => {
    mockFeatures = { libraryShare: false, libraryDaily: false };
    jest.mocked(router.push).mockClear();
  });

  it('finds a verse, pages on, and switches to the ancient writings', async () => {
    jest.mocked(api.library).mockResolvedValue({ enabled: true, collections: [{ id: 'bible-kjv', title: 'King James Bible', faith: true }, { id: 'ancient-writings', title: 'Ancient writings', faith: false }] });
    jest.mocked(api.searchLibrary).mockResolvedValueOnce({ total: 2, source: 'Project Gutenberg', hits: [psalm] });
    await renderApp(<LibraryScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Words to find'), 'the lord is my shepherd');
    await fireEvent.press(screen.getByText('Search'));
    expect(await screen.findByText('Psalms 23:1')).toBeTruthy();
    expect(screen.getByText('2 passages')).toBeTruthy();
    expect(api.searchLibrary).toHaveBeenCalledWith({ q: 'the lord is my shepherd', collection: 'bible-kjv', offset: 0, limit: 20 });

    jest.mocked(api.searchLibrary).mockResolvedValueOnce({ total: 2, source: 'Project Gutenberg', hits: [{ ...psalm, ref: 'John 10:11', text: 'I am the good shepherd.' }] });
    await fireEvent.press(screen.getByText('Show more'));
    expect(await screen.findByText('John 10:11')).toBeTruthy();
    expect(screen.queryByText('Show more')).toBeNull();

    jest.mocked(api.searchLibrary).mockResolvedValueOnce({ total: 1, source: 'Project Gutenberg', hits: [tale] });
    await fireEvent.press(screen.getByText('Ancient writings'));
    expect(await screen.findByText(tale.work.title)).toBeTruthy();
    expect(screen.getByText('Some words are nearby or a similar word')).toBeTruthy();
    await waitFor(() => expect(api.searchLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ collection: 'ancient-writings', offset: 0 })));
  });

  it('says when it is off', async () => {
    jest.mocked(api.library).mockResolvedValue({ enabled: false });
    await renderApp(<LibraryScreen />);
    expect(await screen.findByText('Text search is not open.')).toBeTruthy();
  });

  it('shares a passage into a new post with its citation, only while sharing is on', async () => {
    jest.mocked(api.library).mockResolvedValue({ enabled: true, collections: [{ id: 'bible-kjv', title: 'King James Bible', faith: true }] });
    jest.mocked(api.searchLibrary).mockResolvedValue({ total: 1, source: 'Project Gutenberg', hits: [psalm] });
    await renderApp(<LibraryScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Words to find'), 'shepherd');
    await fireEvent.press(screen.getByText('Search'));
    expect(await screen.findByText('Psalms 23:1')).toBeTruthy();
    expect(screen.queryByText('Share')).toBeNull();

    mockFeatures = { libraryShare: true, libraryDaily: false };
    await renderApp(<LibraryScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Words to find'), 'shepherd');
    await fireEvent.press(screen.getByText('Search'));
    await fireEvent.press(await screen.findByLabelText('Share Psalms 23:1 (King James Bible) in a new post'));
    const url = jest.mocked(router.push).mock.calls[0]![0] as string;
    expect(new URLSearchParams(url.split('?')[1]).get('body')).toBe('“The LORD is my shepherd; I shall not want.”\n— Psalms 23:1 (King James Bible)');
    expect(sharedPassage('  x  ', 'y')).toBe('“x”\n— y');
  });

  it('shows the daily passage card while it is on, with Share when sharing is on', async () => {
    const day = { enabled: true as const, day: '2026-10-29', share: true, passage: { collection: 'bible-kjv' as const, ...psalm } };
    jest.mocked(api.libraryDaily).mockResolvedValue(day);
    await renderApp(<DailyPassage />);
    expect(screen.queryByText("Today's passage")).toBeNull();
    expect(api.libraryDaily).not.toHaveBeenCalled();

    mockFeatures = { libraryShare: true, libraryDaily: true };
    await renderApp(<DailyPassage />);
    expect(await screen.findByText(psalm.text)).toBeTruthy();
    expect(screen.getByText('Psalms 23:1 (King James Bible)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Share'));
    expect(router.push).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Not now'));
    expect(screen.queryByText(psalm.text)).toBeNull();
  });
});
