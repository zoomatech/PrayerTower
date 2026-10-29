// Prayer without ceasing: the author keeps their own request on the air, and a refusal shows.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderApp } from '@/__tests__/helpers';
import { KeepOnAir } from '@/components/keep-on-air';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { setKeepOnAir: jest.fn() } }));

function Harness() {
  const [on, setOn] = useState(false);
  return <KeepOnAir postId="p1" on={on} onChange={setOn} />;
}

it('turns "keep on the air" on for the author', async () => {
  jest.mocked(api.setKeepOnAir).mockResolvedValue({ keepOnAir: true });
  await renderApp(<Harness />);
  await act(async () => fireEvent.press(screen.getByText('Keep on the air')));
  expect(api.setKeepOnAir).toHaveBeenCalledWith('p1', true);
  expect(screen.getByRole('switch').props.accessibilityState?.checked ?? screen.getByRole('switch').props.value).toBe(true);
});

it('shows why it could not be kept on the air', async () => {
  jest.mocked(api.setKeepOnAir).mockRejectedValue(new Error("Sensitive requests aren't sent by radio."));
  await renderApp(<Harness />);
  await act(async () => fireEvent.press(screen.getByText('Keep on the air')));
  expect(screen.getByText("Sensitive requests aren't sent by radio.")).toBeTruthy();
});
