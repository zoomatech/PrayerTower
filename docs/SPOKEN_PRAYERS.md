# Spoken prayers

A member who prayed for a request can record a short voice prayer for the person who asked. This is the "Paid spoken-audio prayer" idea from the unbuilt-ideas inventory, built as **free, with an optional token offer** (Steve, 2026-10-28).

## How it works

1. **An admin turns it on.** Admin → Spoken prayers. It is **off** by default. The admin also sets:
   - the longest recording (default 60 seconds, from 10 to 300)
   - the most tokens a member may offer (default 10, and 0 makes every spoken prayer free)
2. **The person who asked opts in.** On their own request they pick **Off**, **On, free**, or **Offer N tokens**. Nobody can send them a recording until they do.
3. **Someone who prayed records one.** They must have tapped Praying Now on that request first. Each person can send one spoken prayer per request, and only the person who asked can hear it.
4. **Listening pays the offer.** When the person who asked plays a recording for the first time, the offered tokens move from their balance to the sender, once.
   - If they don't have enough tokens, nothing is paid. It is paid on a later listen, once they do.
   - Tokens are never bought or cashed out, the same as everywhere else in the app.

## Safety

- **Report:** the person who received a recording, or the one who sent it, can report it. It then goes to the moderation queue as "Spoken prayer, N seconds of audio", and moderators can play it through a short-lived link.
  - A removal can claw back a paid offer, using the transfer on the row.
- **Remove:** either person can remove a recording. The audio file is deleted with it.
- **Blocking:** blocking the other person, either way, hides recordings and stops payments.
- **Deleting an account** deletes its recordings, both sent and received. A data export includes them.

## Open Circle

In the non-religious community the feature is called **Voice notes**. It works the same way, and its notices use neutral wording.

## Where the code is

| Part | Location |
|---|---|
| Database | `supabase/migrations/20261029002300_spoken_prayer_enum.sql` and `20261029002400_spoken_prayers.sql`. The audio is in the private `spoken-prayers` bucket. |
| Server | `apps/server/src/modules/spoken-prayers/` |
| App | `apps/mobile/src/components/spoken-prayers.tsx`, which records and plays with `expo-audio` |
| Tests | `apps/server/test/spoken-prayers.test.ts` and `apps/mobile/src/components/__tests__/spoken-prayers.test.tsx` |

The iPhone asks for microphone access the first time someone records. The prompt text is set in `app.json`, in the `expo-audio` plugin entry.
