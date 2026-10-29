// Gentle repair: the first-comment welcome card, "This hurt me" (an unsigned note or
// an invited sorry), and the Mend screen for each side. Nothing shows while off.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { HurtNote, WelcomeCard } from '@/components/gentle-repair';
import { api, type Mend } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({
  api: { features: jest.fn(), welcomeCard: jest.fn(), dismissWelcome: jest.fn(), askKindly: jest.fn(), inviteMend: jest.fn(), mend: jest.fn(), writeSorry: jest.fn(), acceptMend: jest.fn(), closeMend: jest.fn() },
}));

const on = (f: { welcomeCard?: boolean; askKindly?: boolean; mend?: boolean }) =>
  jest.mocked(api.features).mockResolvedValue({ features: { welcomeCard: false, askKindly: false, mend: false, ...f } } as Awaited<ReturnType<typeof api.features>>);
const base: Mend = { id: 'm1', role: 'author', status: 'invited', comment: { postId: 'p1', body: 'You should have known better.' }, author: null, sorry: null, canRevise: true, moderatorNote: null };

beforeEach(() => resetFeatures());

describe('Welcome card', () => {
  it('shows the default words before a first comment and goes away on "Got it"', async () => {
    on({ welcomeCard: true });
    jest.mocked(api.welcomeCard).mockResolvedValue({ show: true, text: null });
    jest.mocked(api.dismissWelcome).mockResolvedValue({ show: false, text: null });
    await renderApp(<WelcomeCard />);
    expect(await screen.findByText(/Here we lift each other up/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Got it')));
    expect(screen.queryByTestId('welcome-card')).toBeNull();
  });
});

describe('This hurt me', () => {
  it('shows nothing while both switches are off', async () => {
    on({});
    await renderApp(<HurtNote commentId="c1" onReport={jest.fn()} />);
    await act(async () => undefined);
    expect(screen.queryByTestId('hurt-c1')).toBeNull();
  });

  it('sends an unsigned note with the chosen reason, or invites a sorry', async () => {
    on({ askKindly: true, mend: true });
    jest.mocked(api.askKindly).mockResolvedValue({ sent: true });
    await renderApp(<HurtNote commentId="c1" onReport={jest.fn()} />);
    const link = await screen.findByTestId('hurt-c1');
    await act(async () => fireEvent.press(link));
    await act(async () => fireEvent.press(screen.getByText("It's hard to read while grieving")));
    await act(async () => fireEvent.press(screen.getByText('Send a gentle, unsigned note')));
    expect(api.askKindly).toHaveBeenCalledWith('c1', 'grief');
    expect(screen.getByText('Sent. Thank you for asking kindly.')).toBeTruthy();
  });

  it('report stays one tap away', async () => {
    on({ mend: true });
    const onReport = jest.fn();
    jest.mocked(api.inviteMend).mockResolvedValue({ mend: { ...base, role: 'hurt' } });
    await renderApp(<HurtNote commentId="c2" onReport={onReport} />);
    const link = await screen.findByTestId('hurt-c2');
    await act(async () => fireEvent.press(link));
    fireEvent.press(screen.getByText('Report it instead'));
    expect(onReport).toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByText('Invite a sorry')));
    expect(api.inviteMend).toHaveBeenCalledWith('c2');
  });
});
