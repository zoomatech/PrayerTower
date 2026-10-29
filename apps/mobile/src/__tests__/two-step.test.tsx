// Two-step sign-in: turning it on from Me → Password and email, and the code screen.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import TwoStep from '@/app/two-step';
import { TwoStepSettings } from '@/components/two-step';
import { supabase } from '@/lib/supabase';

let mockTwoStep = true;
jest.mock('@/lib/features', () => ({ useFeatures: () => ({ twoStep: mockTwoStep }) }));
const mockSignOut = jest.fn();
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

const mfa = supabase.auth.mfa as unknown as Record<string, jest.Mock>;
const verified = { id: 'f1', factor_type: 'totp', status: 'verified' };
const none = { data: { all: [], totp: [], phone: [] }, error: null };
const enrolled = { data: { all: [verified], totp: [verified], phone: [] }, error: null };

beforeEach(() => {
  mockTwoStep = true;
  mfa.listFactors.mockResolvedValue(none);
});

describe('Two-step settings', () => {
  it('stays hidden while the switch is off and the member has no app', async () => {
    mockTwoStep = false;
    await renderApp(<TwoStepSettings />);
    await waitFor(() => expect(mfa.listFactors).toHaveBeenCalled());
    expect(screen.queryByText('Two-step sign-in')).toBeNull();
  });

  it('adds an authenticator app and checks its first code', async () => {
    mfa.enroll.mockResolvedValueOnce({ data: { id: 'f2', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' } }, error: null });
    await renderApp(<TwoStepSettings />);
    await fireEvent.press(await screen.findByTestId('two-step-start'));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp' });
    mfa.listFactors.mockResolvedValue(enrolled);
    await fireEvent.changeText(screen.getByTestId('two-step-setup-code'), '123456');
    await fireEvent.press(screen.getByTestId('two-step-finish'));
    await waitFor(() => expect(mfa.verify).toHaveBeenCalledWith({ factorId: 'f2', challengeId: 'challenge-1', code: '123456' }));
    expect(await screen.findByText('Two-step sign-in is on.')).toBeTruthy();
  });

  it('turns it off', async () => {
    mfa.listFactors.mockResolvedValue(enrolled);
    await renderApp(<TwoStepSettings />);
    await fireEvent.press(await screen.findByTestId('two-step-off'));
    await waitFor(() => expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' }));
  });
});

describe('Enter your code', () => {
  it('checks the code against the member’s app', async () => {
    mfa.listFactors.mockResolvedValue(enrolled);
    await renderApp(<TwoStep />);
    await fireEvent.changeText(await screen.findByTestId('two-step-code'), '654321');
    await waitFor(() => expect(screen.getByTestId('two-step-submit')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('two-step-submit'));
    await waitFor(() => expect(mfa.verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'challenge-1', code: '654321' }));
  });

  it('says why a wrong code failed', async () => {
    mfa.listFactors.mockResolvedValue(enrolled);
    mfa.verify.mockResolvedValueOnce({ data: null, error: { message: 'Invalid TOTP code entered' } });
    await renderApp(<TwoStep />);
    await fireEvent.changeText(await screen.findByTestId('two-step-code'), '000000');
    await waitFor(() => expect(screen.getByTestId('two-step-submit')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('two-step-submit'));
    expect(await screen.findByText('Invalid TOTP code entered')).toBeTruthy();
  });
});
