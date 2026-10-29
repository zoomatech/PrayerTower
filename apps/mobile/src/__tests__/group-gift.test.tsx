import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { GroupGift } from '@/components/group-gift';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { groupGiftInfo: jest.fn(), giveToGroup: jest.fn() } }));

describe('Gift to a group', () => {
  it('shows the split and gives', async () => {
    jest.mocked(api.groupGiftInfo).mockResolvedValue({ enabled: true, recipients: 3 });
    jest.mocked(api.giveToGroup).mockResolvedValue({ recipients: 3, each: 3, given: 9, balance: 1 });
    await renderApp(<GroupGift target="group" id="g1" />);
    await fireEvent.press(await screen.findByText('Give tokens to this group'));
    await fireEvent.changeText(screen.getByLabelText('How many tokens'), '10');
    expect(screen.getByText('Each of the 3 others gets 3.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Give'));
    await waitFor(() => expect(api.giveToGroup).toHaveBeenCalledWith('group', 'g1', 10));
    expect(await screen.findByText('Given: 3 each to 3 people.')).toBeTruthy();
  });

  it('stays hidden while switched off', async () => {
    jest.mocked(api.groupGiftInfo).mockResolvedValue({ enabled: false });
    await renderApp(<GroupGift target="event" id="e1" />);
    await waitFor(() => expect(api.groupGiftInfo).toHaveBeenCalled());
    expect(screen.queryByText('Give tokens to the people going')).toBeNull();
  });
});
