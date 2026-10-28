# Annual Prayer Warrior Award

Business Plan 6.4 calls for a yearly honor for the people who pray most for others. It is built and stays **off** until an admin turns it on.

## How it works

1. **Settings.** Admin → Prayer Warrior Award:
   - **Award on or off.** Off by default.
   - **Winners each year.** Default 3.
   - **Token prize** and **Priestly token prize.** Both default to 0.
   - **Other prize.** Free text such as "a framed certificate" or a cash prize. It is shown to winners, and the people responsible handle it outside the app.
   - **Public Hall.** On by default.
2. **Choosing winners.** An admin enters a year and sees that calendar year's standings. Standings count verified prayers for other people's requests plus kept promises (check-ins), with ties broken by how many people were prayed for. **Offer the award** goes to the top people who haven't been offered it yet, up to the winners setting. Each winner gets a notice.
3. **The winner decides.** On Me the winner sees the offer and the prize, then accepts or declines.
   - **Accepting** pays the token prizes once, from the mint, and the winner chooses whether the Hall shows their name.
   - **Declining** frees the place. The admin can offer it again, and it goes to the next person in line.
4. **The Hall.** The *Hall of Prayer Warriors* lists accepted winners by year. A winner who didn't choose to show their name appears as "A Prayer Warrior".

In the non-religious Open Circle community the same award is called the **Kindness Champion** award.

## Where the code is

| Part | Location |
|---|---|
| Database | `supabase/migrations/20261029002800_prayer_warrior_award.sql` |
| Server | `apps/server/src/modules/admin/awards.ts` and `award-routes.ts`. Standings are in `warriors.ts`. |
| App | `components/award-card.tsx` (Me), `app/awards.tsx` (the Hall), and Admin → Prayer Warrior Award |
| Tests | `apps/server/test/award.test.ts` and `apps/mobile/src/components/__tests__/award-card.test.tsx` |
