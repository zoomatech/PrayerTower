// Backup codes and passkeys: making codes on Me → Password and email, spending one
// on the code screen after a lost phone, and the admin switches.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import TwoStep from '@/app/two-step';
import { BackupCodes } from '@/components/backup-codes';
import { PasskeySignIn, PasskeysCard } from '@/components/passkeys';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

let mockFeatures = { backupCodes: true, passkeys: true };
jest.mock('@/lib/features', () => ({ useFeatures: () => mockFeatures }));
const mockCodeDone = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ signOut: jest.fn(), codeDone: mockCodeDone }) }));
jest.mock('@/lib/api', () => ({
  api: { backupCodes: jest.fn(), makeBackupCodes: jest.fn(), useBackupCode: jest.fn(), signupConfig: jest.fn() },
}));

const mfa = supabase.auth.mfa as unknown as Record<'listFactors', jest.Mock>;
const CODES = ['K4M9-X7QP', '2AB8-HT3Z', '0000-1111', '2222-3333', '4444-5555', '6666-7777', '8888-9999', 'AAAA-BBBB', 'CCCC-DDDD', 'EEEE-FFFF'];

beforeEach(() => {
  mockFeatures = { backupCodes: true, passkeys: true };
  mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [{ id: 'f1', status: 'verified' }], phone: [] }, error: null });
});

it('shows nothing while backup codes are off', async () => {
  mockFeatures = { backupCodes: false, passkeys: false };
  await renderApp(<BackupCodes />);
  expect(screen.queryByTestId('backup-codes')).toBeNull();
  expect(api.backupCodes).not.toHaveBeenCalled();
});

it('makes ten codes, shows them once, then only the count', async () => {
  jest.mocked(api.backupCodes).mockResolvedValueOnce({ enabled: true, remaining: 0, createdAt: null }).mockResolvedValue({ enabled: true, remaining: 10, createdAt: '2026-10-29T08:00:00Z' });
  jest.mocked(api.makeBackupCodes).mockResolvedValue({ codes: CODES });
  await renderApp(<BackupCodes />);
  await fireEvent.press(await screen.findByTestId('backup-codes-make'));
  expect(await screen.findByText('K4M9-X7QP')).toBeTruthy();
  expect(screen.getByText('Save these now. You won’t see them again. Each code works once.')).toBeTruthy();
  await fireEvent.press(screen.getByText('I saved them'));
  expect(screen.queryByText('K4M9-X7QP')).toBeNull();
  expect(await screen.findByText('10 unused backup codes. Each works once.')).toBeTruthy();
  expect(screen.getByText('Make new codes')).toBeTruthy();
});

it('gets a member who lost their phone back in with a backup code', async () => {
  jest.mocked(api.signupConfig).mockResolvedValue({ inviteOnly: true, backupCodes: true });
  jest.mocked(api.useBackupCode).mockRejectedValueOnce(new Error("That code didn't work. Check it, or use another one.")).mockResolvedValueOnce({ ok: true });
  await renderApp(<TwoStep />);
  await fireEvent.press(await screen.findByTestId('use-backup-code'));
  await fireEvent.changeText(screen.getByTestId('backup-code'), 'zzzz-zzzz');
  await fireEvent.press(screen.getByTestId('backup-code-submit'));
  expect(await screen.findByText("That code didn't work. Check it, or use another one.")).toBeTruthy();
  expect(mockCodeDone).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByTestId('backup-code'), 'k4m9 x7qp');
  await fireEvent.press(screen.getByTestId('backup-code-submit'));
  await waitFor(() => expect(api.useBackupCode).toHaveBeenLastCalledWith('k4m9 x7qp'));
  expect(mockCodeDone).toHaveBeenCalled();
});

it('offers no backup code link while the switch is off', async () => {
  jest.mocked(api.signupConfig).mockResolvedValue({ inviteOnly: true });
  await renderApp(<TwoStep />);
  await waitFor(() => expect(api.signupConfig).toHaveBeenCalled());
  expect(screen.queryByTestId('use-backup-code')).toBeNull();
});

it('keeps passkeys out of the iPhone app (browser only for now)', async () => {
  await renderApp(
    <>
      <PasskeysCard />
      <PasskeySignIn on onError={jest.fn()} />
    </>,
  );
  expect(screen.queryByTestId('passkeys')).toBeNull();
  expect(screen.queryByTestId('passkey-sign-in')).toBeNull();
});
