// Giving split on Me and in the gift sheet: hidden while off, never on an anonymous post.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { GivingSplitChoice, PostGivingSplit } from '@/components/giving-split';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), myGivingSplit: jest.fn(), setGivingSplit: jest.fn(), postGivingSplit: jest.fn() } }));

const on = (givingSplit: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { givingSplit } } as Awaited<ReturnType<typeof api.features>>);
beforeEach(() => resetFeatures());

describe('giving split', () => {
  it('shows nothing while off', async () => {
    on(false);
    await renderApp(<GivingSplitChoice />);
    await renderApp(<PostGivingSplit postId="p1" name="Ruth" />);
    expect(screen.queryByText('Share of gifts to my own page')).toBeNull();
    expect(api.myGivingSplit).not.toHaveBeenCalled();
    expect(api.postGivingSplit).not.toHaveBeenCalled();
  });

  it('asks for a page first, then lets the member pick a share within the limit', async () => {
    on(true);
    jest.mocked(api.myGivingSplit).mockResolvedValue({ split: { enabled: true, maxPercent: 30, percent: 0, supportUrl: null } });
    const first = await renderApp(<GivingSplitChoice />);
    expect(await screen.findByText('Add your support page above first.')).toBeTruthy();
    await first.unmount();
    jest.mocked(api.myGivingSplit).mockResolvedValue({ split: { enabled: true, maxPercent: 30, percent: 0, supportUrl: 'https://ko-fi.com/me' } });
    jest.mocked(api.setGivingSplit).mockResolvedValue({ split: { enabled: true, maxPercent: 30, percent: 20, supportUrl: 'https://ko-fi.com/me' } });
    await renderApp(<GivingSplitChoice />);
    expect(await screen.findByText('30%')).toBeTruthy();
    expect(screen.queryByText('40%')).toBeNull();
    await fireEvent.press(screen.getByText('20%'));
    expect(api.setGivingSplit).toHaveBeenCalledWith(20);
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it("shows the author's split in the gift sheet", async () => {
    on(true);
    jest.mocked(api.postGivingSplit).mockResolvedValue({ split: { url: 'https://ko-fi.com/ruth', percent: 10, shareCents: null } });
    await renderApp(<PostGivingSplit postId="p1" name="Ruth" />);
    expect(await screen.findByText('Ruth asks that 10% of gifts toward them go to their own page.')).toBeTruthy();
  });
});
