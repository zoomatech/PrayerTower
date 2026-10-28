# Equal material help for paid radio prayers

From the notebook (Notes p3): "Even when paying for digital prayer eternalization, MUST include equal material help for the afflicted."

**Off by default.** Admin → Equal material help → "Match paid radio prayers with material help".

## How it works

1. While it is on, every radio prayer **paid with Priestly tokens** records a match: help of equal value owed to people in need. Free radio prayers (radio funding set to free) owe nothing.
2. The value is the tokens spent times **the value of one Priestly token, in cents** (default 100, a placeholder for Steve to set).
3. If a radio prayer never goes out, its tokens are refunded and its match is cancelled.
4. When staff send real help (groceries, rent help, a gift card), they press **Record that this help was sent** and say what was given. That adds one "help sent" entry to the Common Prayer Fund for the whole amount owed, and marks those matches fulfilled. The public fund report (when its page is on) shows it under help sent.
5. Members see, under the radio button on a request: "An equal amount of material help goes to people in need for every paid radio prayer." (Open Circle: "…radio message.")

No money moves through the app. Admin → Equal material help shows how much is owed and how much has been sent.

Data: migration `20261029005000_material_match.sql`; code `apps/server/src/modules/material-match/`.
