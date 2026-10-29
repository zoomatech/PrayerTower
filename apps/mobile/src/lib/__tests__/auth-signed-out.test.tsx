// A sign-in that ends some other way (it expired, or ended on another device) clears what
// was saved for offline use, so the next person on this device never sees or sends it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider } from '@/lib/auth';
import { enqueue } from '@/lib/offline';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  api: { me: jest.fn(async () => ({ profile: { id: 'u1' }, roles: [] })) },
}));

it('clears the saved feed and queued actions when the session ends', async () => {
  const auth = supabase.auth as unknown as { getSession: jest.Mock; onAuthStateChange: jest.Mock };
  auth.getSession.mockResolvedValueOnce({ data: { session: null } });
  let listener: (event: string, session: unknown) => void = () => undefined;
  auth.onAuthStateChange.mockImplementationOnce((fn) => {
    listener = fn;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  await AsyncStorage.setItem('offline:cache:v1:feed', JSON.stringify({ savedAt: 1, value: { posts: [] } }));
  await enqueue({ method: 'POST', path: '/posts/p1/praying-now', body: {}, label: 'Praying Now' });
  await render(
    <AuthProvider>
      <Text>app</Text>
    </AuthProvider>,
  );
  await act(async () => listener('SIGNED_OUT', null));
  await waitFor(async () => expect((await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('offline:'))).toEqual([]));
});
