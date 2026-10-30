# Skin hooks: how a skin connects to the data

A feed skin decides only how things **look**. Everything a button, a tap or a scroll
**does** comes from one shared layer, so every skin's buttons work the same way and a
new skin can't get them wrong. Skins may use as many different templates (layouts) as
they need; they all plug into the same hooks.

This work lives on its own branch until Steve says to merge it.

## The rule

- A skin never calls the API, the router or a share sheet itself.
- A skin gets each button as data (its name, whether it is on, and `press`) and draws it
  however it likes: round icons, neon line icons inside the frame, leaves, stone.
- A skin may add its own look-only state (how a vine grows, a card's tilt), never its own
  version of what a button does.

## The hooks

| What | Expo / web (`apps/mobile/src/skins/`) | Native Swift (`apps/ios-native/`) |
| --- | --- | --- |
| Praying Now, like (thumbs up), Commit to Pray, Prayer Cast (the radio antenna; only where the community has radio), encourage, well wishes, share, gift | `useActionRow(card, act)` in `action-row.tsx` gives each button's `name`, `tip`, `active`, `press` and emoji meanings. Like toggles at once; the rest go to `act`. | `FeedHooks.act` (`App/Skins/FeedHooks.swift`); the row's buttons come from Kit `ActionRow.items`. |
| Every card action, from anywhere in a skin | `useFeedHooks().act` (`feed-hooks.tsx`) | `FeedHooks.act` |
| "Not for me" | `useFeedHooks().hide` | (not in the native feed yet) |
| Open a post, or open it at one comment | `useFeedHooks().openPost(postId, commentId?)` | `FeedHooks.open` |
| A post's comments and their replies | `usePostComments(card, when)` in `comments.ts` | `FeedHooks.loadComments` |
| A comment's own buttons: reply, "this helped", share | `useCommentActions(postId, comment)`; a button the member can't use comes back `null` | (native comment buttons are still in the kindness port) |
| Comments open / close: closed cluster shows the top one, a tap spreads it, pages of more, one reply open at a time | `useCommentCluster()` and `clusterSlice()` | Kit `BeanDraw.LeafState.toggleReplies` |
| Infinite scroll | `useFeedHooks().loadMore` / `atEnd`; list skins use `onEndReached`, deck and climb skins use `useNearEnd()` | `FeedHooks.loadMore` / `hasMore`, and `.loadsMore(after:in:_:)` on each post |
| Pull to refresh | `useFeedHooks().refresh` / `refreshing` | (each skin's scroll view) |
| Swipe right to pray (deck) | `act(card, 'praying_now')` | `hooks.act(.prayingNow, card)` |

## Adding a skin

1. Write the layout (Expo: `apps/mobile/src/layouts/`, register it in `layouts/index.tsx`;
   native: a view in `App/Skins/`, add it to `SkinnedFeed`).
2. Draw the card with `renderCard` / `row`, or draw your own buttons from `useActionRow`.
3. Load comments with `usePostComments`, open and close them with `useCommentCluster`,
   and give each comment its buttons from `useCommentActions`.
4. Use `onEndReached` / `.loadsMore` for the next page.

Tests: `apps/mobile/src/skins/__tests__/skin-hooks.test.tsx` draws a made-up skin with
plain-word buttons and checks it gets the same buttons doing the same things.
