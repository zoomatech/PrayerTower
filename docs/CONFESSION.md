# Confession with clergy

From notebook Page 2: "Confession connected to clergy". A member makes a private confession to a pastor or counselor. The feature is built on the "Talk with someone" care queue and stays **off** until an admin turns it on.

## How it works

1. **Admin → Care and events → "Confession to a pastor".** This switch is off by default. The same section sets how many days a closed confession is kept before it is erased. The default is 7 days, and 0 means it is erased as soon as it is closed.
2. **The member asks.** On *Pray with someone* they pick **Confession** and write what they want to bring. Before sending, the screen tells them that only a pastor or counselor will see it, and when it will be erased.
3. **Only clergy answer.** Staff with the *pastor_counselor* role see it in their care queue. Prayer partners never see it and cannot claim it. The notice they receive says only "Someone asked to make a confession", never what was written.
4. **A private conversation.** The pastor who claims the confession and the member talk one to one.
5. **Erased after it closes.** Either person closes the confession when they are done. Once the retention period has passed, the nightly retention job erases it:
   - It deletes the conversation and every message in it.
   - The request row keeps only "(erased)", its kind and its dates.

   A confession that a moderator still has to review is not erased until that review is finished. This covers, for example, a message flagged because someone may be in danger.
6. **Open Circle.** Members of the non-religious community are not offered confession.

## What still applies

- **Crisis detection.** A confession that mentions suicide or self-harm is still flagged, moderators are told, and the member is shown the crisis line, as everywhere else in the app.
- **Reporting and blocking.** These work as in any conversation.

## For the legal side

Points for counsel to review:
- Confidentiality promises.
- Mandatory-reporting duties for clergy in each state.
- Whether messages should skip the automated content check.
- The retention period.

All of these are settings or a one-line change. The feature is built so it can stay switched off until those decisions are made.

## Where the code is

| Part | Location |
|---|---|
| Database | `supabase/migrations/20261029002600_confession.sql` (`care_settings.confession_retention_days`) |
| Server | `apps/server/src/modules/care/` and `eraseConfessions` in `apps/server/src/modules/retention/index.ts` |
| App | `apps/mobile/src/app/care.tsx` and Admin → Care and events |
| Tests | `apps/server/test/confession.test.ts` |
