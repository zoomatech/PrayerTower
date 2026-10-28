// Sign-in and invite-only sign-up, as a new pilot member meets them.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import SignIn from '@/app/sign-in';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/api', () => ({ api: { signupConfig: jest.fn(async () => ({ inviteOnly: true })) } }));

const auth = supabase.auth as jest.Mocked<typeof supabase.auth>;
afterEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({}));
const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);

describe('Sign in', () => {
  it('signs in with the trimmed email and the password', async () => {
    await renderApp(<SignIn />);
    await type('Email', ' ruth@example.com ');
    await type('Password', 'prayers123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ruth@example.com', password: 'prayers123' });
  });

  it('keeps the button off until the email and a 6-character password are in', async () => {
    await renderApp(<SignIn />);
    await type('Email', 'ruth@example.com');
    await type('Password', '123');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await type('Password', '123456');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('shows the reason a sign-in failed', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: 'Invalid login credentials' } } as never);
    await renderApp(<SignIn />);
    await type('Email', 'ruth@example.com');
    await type('Password', 'wrong-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid login credentials')).toBeTruthy();
  });
});

describe('Sign up during the invite-only pilot', () => {
  const fillIn = async (code: string) => {
    await fireEvent.press(screen.getByRole('button', { name: 'New here? Create an account' }));
    await type('Your name', 'Ruth');
    await type('Invite code', code);
    await type('Email', 'ruth@example.com');
    await type('Password', 'prayers123');
  };

  it('asks for the invite code and sends it with the name', async () => {
    await renderApp(<SignIn />);
    await fillIn(' PRAY-1234 ');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ruth@example.com',
      password: 'prayers123',
      options: { data: { display_name: 'Ruth', locale: 'en', invite_code: 'PRAY-1234' } },
    });
    expect(await screen.findByText(/Check your email to confirm your account/)).toBeTruthy();
  });

  it('cannot create an account without a code', async () => {
    await renderApp(<SignIn />);
    await fillIn('');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('explains a wrong invite code in plain words', async () => {
    auth.signUp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: 'That invite code is not valid. Check it, or ask for a new one.' } } as never);
    await renderApp(<SignIn />);
    await fillIn('WRONG');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That invite code is not valid. Check it, or ask for a new one.')).toBeTruthy();
  });

  it('opens an invite link straight to sign-up with the code filled in', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ invite: 'PRAY-1234' });
    await renderApp(<SignIn />);
    expect(screen.getByDisplayValue('PRAY-1234')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
  });

  it('hides the code field once an admin opens sign-up', async () => {
    (api.signupConfig as jest.Mock).mockResolvedValueOnce({ inviteOnly: false });
    await renderApp(<SignIn />);
    await fireEvent.press(screen.getByRole('button', { name: 'New here? Create an account' }));
    await waitFor(() => expect(screen.queryByLabelText('Invite code')).toBeNull());
  });
});
