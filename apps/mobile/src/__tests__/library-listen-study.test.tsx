import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Speech from 'expo-speech';

import { renderApp } from '@/__tests__/helpers';
import StudyRoomsScreen from '@/app/study-rooms';
import { ListenPassage } from '@/components/listen-passage';
import { StudyStart } from '@/components/study-start';
import { api, type StudyRoom } from '@/lib/api';
import { router, useLocalSearchParams } from 'expo-router';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]),
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@/lib/api', () => ({
  api: { libraryRecording: jest.fn(), myCircles: jest.fn(), startStudy: jest.fn(), studies: jest.fn(), study: jest.fn(), studyReply: jest.fn(), removeStudyReply: jest.fn(), removeStudy: jest.fn(), precheck: jest.fn() },
}));
let mockFeatures = { libraryListen: true, libraryStudies: true, prayerCircles: true };
jest.mock('@/lib/features', () => ({ useFeatures: () => mockFeatures }));

const KEY = 'd'.repeat(32);

beforeEach(() => {
  mockFeatures = { libraryListen: true, libraryStudies: true, prayerCircles: true };
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});

describe('Listening', () => {
  it('reads a passage with the device voice, then finds and credits a LibriVox recording', async () => {
    jest.mocked(api.libraryRecording).mockResolvedValue({
      recording: { url: 'https://www.archive.org/download/x/psalms_07.mp3', title: 'Chapter 07 - Psalms 21 - 23', project: 'Bible (KJV) 19: Psalms (version 2)', readers: ['peaceuntoyou'], seconds: 600, credit: 'Read by peaceuntoyou for LibriVox: Bible (KJV) 19: Psalms (version 2), “Chapter 07 - Psalms 21 - 23”. Public domain.', projectUrl: 'https://librivox.org/x' },
    });
    await renderApp(<ListenPassage collection="bible-kjv" passageKey={KEY} text="The LORD is my shepherd" citation="Psalms 23:1 (King James Bible)" />);
    await fireEvent.press(screen.getByLabelText('Listen to Psalms 23:1 (King James Bible)'));
    expect(Speech.speak).toHaveBeenCalledWith('The LORD is my shepherd\nPsalms 23:1 (King James Bible)', expect.objectContaining({ language: 'en-US' }));
    expect(screen.getByText('Stop')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Find a recording of Psalms 23:1 (King James Bible)'));
    expect(api.libraryRecording).toHaveBeenCalledWith('bible-kjv', KEY);
    expect(await screen.findByText(/Read by peaceuntoyou for LibriVox/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Play the recording: Chapter 07 - Psalms 21 - 23'));
    expect(Speech.stop).toHaveBeenCalled();
    expect(screen.getByText('Pause')).toBeTruthy();
  });

  it('says when there is no recording, and shows nothing while off', async () => {
    jest.mocked(api.libraryRecording).mockResolvedValue({ recording: null });
    await renderApp(<ListenPassage collection="world-classics" passageKey={KEY} text="x" citation="The Analects" />);
    await fireEvent.press(screen.getByText('Find a recording'));
    expect(await screen.findByText(/No recording of this part yet/)).toBeTruthy();
    mockFeatures = { libraryListen: false, libraryStudies: false, prayerCircles: true };
    await renderApp(<ListenPassage collection="world-classics" passageKey={KEY} text="x" citation="The Analects" />);
    expect(screen.queryByText('Listen')).toBeNull();
  });
});

describe('Study rooms', () => {
  it('starts a study of a passage with a circle and opens it', async () => {
    jest.mocked(api.myCircles).mockResolvedValue({ enabled: true, circles: [{ id: 'c1', name: 'Study group', about: null, isOwner: true, members: 3, lastPostAt: null }] });
    jest.mocked(api.startStudy).mockResolvedValue({ id: 's1' });
    await renderApp(<StudyStart of={{ collection: 'bible-kjv', key: KEY }} citation="Psalms 23:1 (King James Bible)" />);
    await fireEvent.press(screen.getByLabelText('Study Psalms 23:1 (King James Bible) with a circle'));
    expect(await screen.findByText('Study group')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('A question or thought to start with'), 'What does “I shall not want” mean?');
    await fireEvent.press(screen.getByText('Start the study'));
    expect(api.startStudy).toHaveBeenCalledWith({ circleId: 'c1', prompt: 'What does “I shall not want” mean?', collection: 'bible-kjv', key: KEY });
    expect(router.push).toHaveBeenCalledWith('/study-rooms?study=s1');
  });

  it('shows a study with its threaded talk, answers a reply and takes one down', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ study: 's1' });
    const room: StudyRoom = {
      study: {
        id: 's1',
        circleId: 'c1',
        prompt: 'Which line stays with you?',
        author: { id: 'u1', displayName: 'Ruth' },
        createdAt: '2026-10-30T00:00:00Z',
        passage: { collection: 'bible-kjv', ref: 'Psalms 1–5', key: KEY, quote: 'Blessed is the man', citation: 'Psalms 1–5 (King James Bible)' },
        plan: { id: 'psalms-30', title: 'Psalms in 30 days', day: 1 },
        replies: 2,
        lastReplyAt: null,
        canRemove: true,
      },
      replies: [{ id: 'r1', author: { id: 'u2', displayName: 'Sam' }, body: 'Like a tree planted by the rivers.', createdAt: '', canRemove: true, answers: [{ id: 'r2', author: { id: 'u1', displayName: 'Ruth' }, body: 'Yes, that one.', createdAt: '', canRemove: true }] }],
    };
    jest.mocked(api.study).mockResolvedValue(room);
    jest.mocked(api.studyReply).mockResolvedValue({ id: 'r3' });
    jest.mocked(api.removeStudyReply).mockResolvedValue({ removed: true });
    await renderApp(<StudyRoomsScreen />);
    expect(await screen.findByText('Like a tree planted by the rivers.')).toBeTruthy();
    expect(screen.getByText('Psalms in 30 days, day 1')).toBeTruthy();
    expect(screen.getByText('Yes, that one.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Answer Sam'));
    expect(screen.getByText('Answering Sam')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Your reply'), 'Planted, not stuck.');
    await fireEvent.press(screen.getByText('Send'));
    expect(api.studyReply).toHaveBeenCalledWith('s1', 'Planted, not stuck.', 'r1');
    await fireEvent.press(screen.getAllByText('Take down')[0]!);
    await waitFor(() => expect(api.removeStudyReply).toHaveBeenCalledWith('r1'));
  });

  it("lists a circle's studies", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ circle: 'c1' });
    jest.mocked(api.studies).mockResolvedValue({
      circle: { id: 'c1', name: 'Study group' },
      studies: [{ id: 's1', circleId: 'c1', prompt: 'Thoughts?', author: { id: 'u1', displayName: 'Ruth' }, createdAt: '', passage: { collection: 'world-classics', ref: 'Chapter 1', key: KEY, quote: 'The Tao', citation: 'Tao Te Ching, Chapter 1 (James Legge (1891))' }, plan: null, replies: 2, lastReplyAt: null, canRemove: false }],
    });
    await renderApp(<StudyRoomsScreen />);
    expect(await screen.findByText('Study room: Study group')).toBeTruthy();
    expect(screen.getByText('Started by Ruth · 2 replies')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open the study of Tao Te Ching, Chapter 1 (James Legge (1891))'));
    expect(router.push).toHaveBeenCalledWith('/study-rooms?study=s1');
  });
});
