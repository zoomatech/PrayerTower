// The App Store side of buying tokens (StoreKit 2 through expo-iap). iPhone only.
// The flow: ask StoreKit to buy, with the member's id as appAccountToken; when the
// purchase arrives, send its signed transaction to the server, which checks it with
// Apple and credits the tokens once; only then finish the transaction. A purchase
// the app didn't get to send (crash, no signal) replays at the next launch and goes
// through the same path, so it's never lost and never credited twice.
import { Platform } from 'react-native';

import { api, type TokenPurchaseResult } from '@/lib/api';

type Iap = typeof import('expo-iap');
// Loaded only on iPhone, so the web app and tests never touch the native module.
const iap = (): Iap => require('expo-iap') as Iap;

export const storeAvailable = Platform.OS === 'ios';

export interface StoreHandlers {
  onCredited: (r: TokenPurchaseResult) => void;
  onError: (message: string | null) => void;
}

/** Connect to the App Store and handle purchases until the returned function is called. */
export async function connect(h: StoreHandlers): Promise<() => void> {
  const m = iap();
  await m.initConnection();
  const updated = m.purchaseUpdatedListener(async (purchase) => {
    const jws = purchase.purchaseToken;
    if (!jws) return;
    try {
      const { purchase: r } = await api.buyTokens(jws);
      // Finish only after the server has the purchase, so StoreKit replays it otherwise.
      await m.finishTransaction({ purchase, isConsumable: true });
      h.onCredited(r);
    } catch (e) {
      h.onError((e as Error).message);
    }
  });
  const failed = m.purchaseErrorListener((e) => h.onError(m.isUserCancelledError(e) ? null : e.message));
  return () => {
    updated.remove();
    failed.remove();
    void m.endConnection();
  };
}

/** Localized App Store prices by product id (falls back to the server's label when missing). */
export async function prices(productIds: string[]): Promise<Record<string, string>> {
  if (!productIds.length) return {};
  const products = (await iap().fetchProducts({ skus: productIds, type: 'in-app' })) ?? [];
  return Object.fromEntries(products.map((p) => [p.id, p.displayPrice]));
}

/** Start a purchase. The result arrives through connect()'s handlers. */
export async function buy(productId: string, userId: string) {
  await iap().requestPurchase({ request: { apple: { sku: productId, appAccountToken: userId } }, type: 'in-app' });
}

/**
 * A practice purchase, sent in place of StoreKit while Admin → Practice mode has
 * purchases on and no App Store connection is set. No money moves; the server
 * marks it "Practice".
 */
export function practiceTransaction(productId: string, userId: string) {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const transactionId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
  const json = JSON.stringify({ productId, appAccountToken: userId, transactionId });
  return `practice.${base64url(json)}`;
}

function base64url(text: string) {
  return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
