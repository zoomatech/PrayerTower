# Giving: gifts, not ads

Everything here is **off by default**. An admin turns it on in **Admin → Giving**.

## How it works
- **Who a gift goes to.** A member gives to one of three targets:
  - **Everyone**, the shared fund. This pays for servers and radio prayers by need.
  - **One member.**
  - **A token pool.**
- **What a paid gift earns.**
  - A gift to everyone or to a member adds **Priestly tokens** to that target: `priestly_per_dollar`, default 1.
  - A gift to a pool adds regular tokens to the pool.
  - The giver always earns **regular tokens**: `regular_per_dollar`, default 10.
  - Tokens never cash out.
- **Everybody gets at least one.** Each member's first `everyone_monthly` radio prayers each month are free (default 1), even while radio prayers cost tokens.
- **Asking for more.** With "Members can ask for more radio prayers" on:
  - Members ask on **Me → Give**.
  - Staff (admin, moderator, pastor/counselor) grant or decline on **Me → Radio prayer requests**.
  - Granted prayers are paid from the shared fund.
- **Giving never changes the feed.** Nothing about a gift changes who sees a request.

## Ways to give (lowest fees first)
| Way | Fee to us | Setup |
|---|---|---|
| Zeffy form | 0%; donors may add an optional tip ([zeffy.com/pricing](https://www.zeffy.com/pricing)) | In Admin → Giving, set "How people give" to **Zeffy link** and paste the form address. Record each gift with **Record the gift**. |
| Stripe, bank transfer (ACH) | 0.8%, capped at $5 ([stripe.com/pricing](https://stripe.com/pricing)) | Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the server, then choose **Stripe**. |
| Stripe, card | 2.9% + 30¢ ([stripe.com/pricing](https://stripe.com/pricing)) | Same as above. Checkout offers bank transfer first. |
| Cash or check | none | Admin → Giving → **Record the gift**. |

For comparison, GoFundMe charges 2.9% + $0.30 per donation ([gofundme.com/pricing](https://www.gofundme.com/pricing)).

## Stripe setup (placeholders until the keys exist)
1. In the Stripe Dashboard, create a webhook endpoint at `https://<api host>/donations/stripe-webhook`. Send these events ([docs.stripe.com/webhooks](https://docs.stripe.com/webhooks)):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
2. Put the secret key (`sk_…`) in `STRIPE_SECRET_KEY` and the signing secret (`whsec_…`) in `STRIPE_WEBHOOK_SECRET`, in the server's private settings only.
3. Bank transfers settle in a few days. A gift shows as "Waiting" until Stripe sends `async_payment_succeeded`, or "Didn't go through" if the transfer fails.

## Refunds
- **Stripe gifts.** Refund them in the Stripe Dashboard. The webhook marks the gift refunded.
- **Zeffy and hand-entered gifts.** Refund them in Admin → Giving → **Mark refunded**.
- **What happens to tokens.** A refund takes back the giver's thank-you tokens if they still have them; tokens already spent stay spent. What the gift already gave to everyone, a member or a pool stays given.

## API
- No sign-in needed:
  - `GET /donations/info`
  - `GET /donations/summary`
  - `POST /donations/stripe-webhook`
- Member:
  - `POST /donations/checkout`
  - `GET /me/donations`
  - `GET /me/radio-allowance`
  - `POST /me/radio-allocation-requests`
- Staff:
  - `GET /staff/radio-allocation-requests`
  - `POST /staff/radio-allocation-requests/:id/decide`
- Admin:
  - `GET` and `PATCH /admin/donation-settings`
  - `GET` and `POST /admin/donations`
  - `POST /admin/donations/:id/refund`
