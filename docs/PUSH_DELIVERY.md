# Push delivery (Admin → Push delivery, off by default)

When the switch is off, pushes go out the way they always have: one Expo request
per notice, a retry of the whole job on an Expo error, quiet hours honored.

When it is on (`push_settings.push_reliability_enabled`):

| What | How |
|---|---|
| No double sends | Every push to each phone is recorded in `push_deliveries` (one row per notice and phone). A retried job sends only to phones still waiting. |
| Retries | HTTP 429 or 5xx, or a `MessageRateExceeded` ticket: the phone is marked `retry` and the job fails, so the worker tries again with its backoff (3 s, 7 s, 20 s, 55 s, 2.5 min, up to 6 tries). Any other refusal (a bad request, missing credentials) is recorded as `error` and not retried, as Expo advises. |
| Receipts | Every 5 minutes, `notifications_push_receipts` reads Expo's receipts for pushes sent 15 minutes to 24 hours ago (up to 1,000 a request). `ok` → delivered. `DeviceNotRegistered` → that phone's token is turned off. `MessageRateExceeded` → sent again later (2, 4, 8 … up to 60 minutes). A push still without a receipt after 24 hours is recorded as lost. |
| Folding | A second push of the same kind about the same request within `collapse_minutes` (default 10) is folded. Pushes also carry an Expo `collapseId` per request and kind, so iOS replaces the shown one rather than stacking them. |
| Hourly cap | At most `max_per_hour` (default 8) everyday pushes per member per hour. |
| Quiet hours | Held until they end (recorded as `held`), and dropped if the member read the notice in the app meanwhile. |
| Always through | Notices in no category (crisis flags, moderation and staff alerts) are never folded, capped or held. Every notice still appears in the app. |

The admin section shows the last 24 hours by outcome, the commonest errors,
and how many phones were turned off.

Source: [Expo: Send notifications with the Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/)
(receipts after about 15 minutes, gone after 24 hours, 1,000 ids per request,
100 messages per request, backoff on 429 and 5xx, `collapseId`).

## Testing without phones or the Apple key

Expo holds the Apple and Google push keys, so the server never needs them. To
watch pushes without a phone:

```
npm run fake-expo -w @prayer-tower/server          # prints each push
EXPO_PUSH_BASE_URL=http://127.0.0.1:4010 npm run dev:api
```

`FAKE_EXPO_MODE=busy` answers 503 (to see retries) and `FAKE_EXPO_MODE=dead`
answers `DeviceNotRegistered` (to see phones turned off). The automated tests
(`apps/server/test/push-delivery.test.ts`) use a stand-in Expo in the same way.
