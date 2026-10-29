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
| Zeffy form | 0%; donors may add an optional tip ([zeffy.com/pricing](https://www.zeffy.com/pricing)) | In Admin → Giving, set "How people give" to **Zeffy link** and paste the form address. With `ZEFFY_API_KEY` set, gifts are recorded on their own (see below); otherwise record each with **Record the gift**. |
| Stripe, bank transfer (ACH) | 0.8%, capped at $5 ([stripe.com/pricing](https://stripe.com/pricing)) | Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the server, then choose **Stripe**. |
| Stripe, card | 2.9% + 30¢ ([stripe.com/pricing](https://stripe.com/pricing)) | Same as above. Checkout offers bank transfer first. |
| PayPal Donate button | 2.89% + 49¢; 1.99% + 49¢ for confirmed charities ([paypal.com business fees](https://www.paypal.com/us/business/paypal-business-fees)) | Make a Donate button in PayPal and paste its link in Admin → Giving → **PayPal Donate link**. It shows as a second button, **Give with PayPal**, beside Stripe or Zeffy, or alone. Record each gift with **Record the gift**, choosing PayPal. |
| Cash or check | none | Admin → Giving → **Record the gift**. |

**Record the gift** takes how it came in (cash or check, Zeffy, PayPal), where it goes (everyone, a pool, or one member), and optionally the member who gave it, who then gets the thank-you tokens.

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

## Zeffy setup (placeholders until the key exists)
Zeffy's API and webhooks are described at [support.zeffy.com](https://support.zeffy.com/get-started-with-the-zeffy-api-yourg).
1. In Zeffy → Settings → Integrations, create an API key. Put it in `ZEFFY_API_KEY` in the server's private settings only.
2. Make a long random secret and put it in `ZEFFY_WEBHOOK_TOKEN`.
3. In the same Zeffy page, add a webhook for `payment.completed` (and `payment.updated` if offered) at `https://<api host>/donations/zeffy-webhook?token=<ZEFFY_WEBHOOK_TOKEN>`.
4. The app reads only the payment ID from each webhook and fetches the payment itself from Zeffy's API, so a forged webhook can't add a gift. Each Zeffy payment is recorded once, as a gift to everyone, and the giver is matched to a member by email. A refunded payment refunds the gift.
5. **Get gifts from Zeffy now** (Admin → Giving) catches up on the last 30 days, in case a webhook was missed.
6. Check the first synced gift's amount. If it shows 100 times too small, set "Zeffy gives amounts in" to **Dollars**.

## Refunds
- **Stripe gifts.** Refund them in the Stripe Dashboard. The webhook marks the gift refunded.
- **Zeffy gifts.** Refunded in Zeffy, they are marked refunded by the next webhook or sync. Without the API key, use Admin → Giving → **Mark refunded**.
- **PayPal and hand-entered gifts.** Refund them in Admin → Giving → **Mark refunded**.
- **What happens to tokens.** A refund takes back the giver's thank-you tokens if they still have them; tokens already spent stay spent. What the gift already gave to everyone, a member or a pool stays given.

## API
- No sign-in needed:
  - `GET /donations/info`
  - `GET /donations/summary`
  - `POST /donations/stripe-webhook`
  - `POST /donations/zeffy-webhook?token=…`
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
  - `POST /admin/donations/zeffy-sync`
