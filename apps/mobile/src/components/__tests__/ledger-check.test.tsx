// Admin → Tokens ledger check: says when it has never run, runs on demand, and names each problem it finds.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { LedgerCheckPanel } from '@/components/ledger-check';
import { api, type LedgerCheck } from '@/lib/api';

jest.mock('expo-router', () => ({ useFocusEffect: (f: () => void) => require('react').useEffect(f, [f]) }));
jest.mock('@/lib/api', () => ({ api: { admin: { ledgerChecks: jest.fn(), runLedgerCheck: jest.fn() } } }));

const check = (over: Partial<LedgerCheck>): LedgerCheck => ({
  id: 'c1', checkedAt: '2026-10-28T04:15:00.000Z', ok: true, accountsChecked: 12, transfersChecked: 340, problems: [], triggeredBy: null, ...over,
});

describe('LedgerCheckPanel', () => {
  it('says it has never run, then runs and reports a clean ledger', async () => {
    jest.mocked(api.admin.ledgerChecks).mockResolvedValue({ checks: [] });
    jest.mocked(api.admin.runLedgerCheck).mockResolvedValue({ check: check({}) });
    await renderApp(<LedgerCheckPanel />);
    expect(await screen.findByText(/Not run yet/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Run the check now' }));
    expect(await screen.findByText(/All balances match the ledger/)).toBeTruthy();
    expect(screen.getByText(/12 accounts and 340 transfers checked/)).toBeTruthy();
  });

  it('names each problem in the latest check', async () => {
    const problems = [{ check: 'negative_balance', account: 'a1' }] as LedgerCheck['problems'];
    jest.mocked(api.admin.ledgerChecks).mockResolvedValue({ checks: [check({ ok: false, problems })] });
    await renderApp(<LedgerCheckPanel />);
    expect(await screen.findByText(/1 problem found .* Admins were alerted\./)).toBeTruthy();
    expect(screen.getByText(/Negative balance: .*"account":"a1"/)).toBeTruthy();
  });

  it('shows the error when the check cannot run', async () => {
    jest.mocked(api.admin.ledgerChecks).mockResolvedValue({ checks: [] });
    jest.mocked(api.admin.runLedgerCheck).mockRejectedValue(new Error('Server unavailable'));
    await renderApp(<LedgerCheckPanel />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Run the check now' }));
    expect(await screen.findByText(/Server unavailable/)).toBeTruthy();
  });
});
