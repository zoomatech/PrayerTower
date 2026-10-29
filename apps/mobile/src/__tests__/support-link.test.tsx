// Outside support link: the profile button opens the member's page; Me saves the link.
import { fireEvent, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import { SupportLinkButton, SupportLinkField } from '@/components/support-link';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

describe('Support link', () => {
  it('opens the page outside the app', async () => {
    await renderApp(<SupportLinkButton url="https://www.ko-fi.com/naomi" name="Naomi" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Support Naomi on ko-fi.com' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://www.ko-fi.com/naomi');
  });

  it('saves a link from Me', async () => {
    const onSave = jest.fn(async () => undefined);
    await renderApp(<SupportLinkField url={null} onSave={onSave} />);
    await fireEvent.changeText(screen.getByLabelText('Your support page (optional)'), 'https://ko-fi.com/me ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save link' }));
    expect(onSave).toHaveBeenCalledWith('https://ko-fi.com/me');
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });
});
