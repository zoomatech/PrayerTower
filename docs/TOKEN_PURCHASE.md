# Buying tokens in the App Store

**It's off by default.** Two things must both be true before anyone can buy:

1. An admin turns purchases on: `PATCH /admin/future-settings { "purchasesEnabled": true }`.
2. The server has Apple's root certificate (`APPLE_ROOT_CA_PATHS`). The Docker image includes it.

Until both are true, the app shows "Buying tokens isn't available yet" and the server credits nothing.

## How a purchase works

1. **The member taps Buy** on Me → Buy tokens (iPhone only). The app uses StoreKit 2 through [expo-iap](https://docs.expo.dev/guides/in-app-purchases/), the library Expo lists for in-app purchases. It passes the member's account id as the `appAccountToken`.
2. **StoreKit returns a signed transaction**, a JWS ("JWS token (iOS) ... for server validation", [OpenIAP Purchase type](https://www.openiap.dev/docs/types/purchase)). The app sends it to `POST /token-store/purchases`.
3. **The server checks it with Apple's own code**, the [App Store Server Library](https://developer.apple.com/documentation/appstoreserverapi/simplifying-your-implementation-by-using-the-app-store-server-library) (`@apple/app-store-server-library`, `SignedDataVerifier.verifyAndDecodeTransaction`). The signature must chain to Apple's root certificate, and the server checks certificate revocation online. The bundle ID and environment must match. The server also checks that:
   - the transaction belongs to this member (`appAccountToken`);
   - it is a consumable for an active product;
   - it was not refunded.
4. **Tokens are credited once.** The ledger key is the Apple transaction id, so a retry, or the same transaction sent twice, never credits twice. Another account can't claim it.
5. **The app finishes the transaction only after the server has it.** If the app crashes or loses signal first, StoreKit replays the purchase at the next launch, so nothing is lost.
6. **The Common Prayer Fund's share** (`common_fund_percent`, default 10%) of the price is recorded on the fund's report when the price is in US dollars.

## Refunds

Apple sends App Store Server Notifications V2 to `POST /store/apple/notifications`. The server checks Apple's signature, and handles each notification once.

- **REFUND** or **REVOKE:** the tokens are taken back, the fund share is voided, and the member is told. If the tokens were already spent, nothing is taken below zero, and the purchase is marked refunded with a note.
- **Other notification types** are acknowledged.

## Products

Products are rows in `token_products`: `sku`, `tokens`, `currency` (`regular` or `priestly`), `price_label`, `apple_product_id` and `active`. The App Store sets the real price, and the app shows Apple's localized price. Create each one in App Store Connect as a **Consumable** with the same product id.

## Settings (server environment)

```
APPLE_IAP_ENVIRONMENT=Sandbox        # Production once the app is live
APPLE_APP_APPLE_ID=                  # the app's Apple ID (a number), required for Production
APPLE_BUNDLE_ID=com.zoomatech.prayertower
APPLE_ROOT_CA_PATHS=/app/certs/AppleRootCA-G3.cer
```

The root certificate comes from [Apple PKI](https://www.apple.com/certificateauthority/), "Apple Root CA - G3". The Dockerfile downloads it into the image.

In App Store Connect, set the **App Store Server Notifications V2** URL to `https://<api domain>/store/apple/notifications`.

## Testing

- `apps/server/test/store.test.ts` runs Apple's real verifier against transactions signed by a throwaway certificate chain (`test/storekit.ts`). The chain carries the same Apple markers the library checks. The tests cover:
  - crediting, retries, another account, and Priestly packs;
  - forged chains, a missing Apple marker, a tampered payload, the wrong app, refunded, inactive and non-consumable transactions;
  - refunds, duplicate notifications, and tokens that were already spent.
- On a device: an iPhone development build with a Sandbox Apple account, with `APPLE_IAP_ENVIRONMENT=Sandbox`.

## Files

- `supabase/migrations/20261029003500_purchase_kind.sql`, `20261029003600_token_purchases.sql`
- `apps/server/src/modules/store/`
- `apps/mobile/src/lib/token-store.ts`, `apps/mobile/src/app/token-store.tsx`
