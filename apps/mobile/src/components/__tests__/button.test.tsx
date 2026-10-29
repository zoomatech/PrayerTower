// The shared Button: a quick double tap on an action that is still sending acts once.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { Button } from '@/components/ui';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Button', () => {
  it('ignores taps while its action is still running, then takes the next one', async () => {
    let finish: () => void = () => undefined;
    const onPress = jest.fn(() => new Promise<void>((r) => (finish = r)));
    await renderApp(<Button label="Send" onPress={onPress} />);
    const button = await screen.findByRole('button', { name: 'Send' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    finish();
    await tick();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(2);
    finish();
    await tick();
  });

  it('runs a plain action on every tap', async () => {
    const onPress = jest.fn();
    await renderApp(<Button label="Next" onPress={onPress} />);
    const button = await screen.findByRole('button', { name: 'Next' });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
