// A member who opens a staff link sees one plain sentence, not the staff tools.
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { staffOnly } from '@/components/staff-only';

let mockRoles: string[] = [];
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ roles: mockRoles }) }));

const Tools = staffOnly(() => <Text>Moderation queue</Text>, ['moderator', 'admin']);

it('shows a member a short notice instead of the staff tools', async () => {
  mockRoles = [];
  await renderApp(<Tools />);
  expect(screen.getByText('This page is for the Prayer Tower team.')).toBeTruthy();
  expect(screen.queryByText('Moderation queue')).toBeNull();
});

it('shows staff the tools', async () => {
  mockRoles = ['moderator'];
  await renderApp(<Tools />);
  expect(screen.getByText('Moderation queue')).toBeTruthy();
});
