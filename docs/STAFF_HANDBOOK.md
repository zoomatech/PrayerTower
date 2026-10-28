# Moderator and pastor handbook

This handbook is for the people who look after Prayer Tower members during the pilot: moderators, pastors and counselors, prayer partners and the Witness team. It covers where each tool is, what each button does, and what to do when someone may be in danger.

> **You are not a crisis counselor.** If someone may be in immediate danger, call 911 (or the local emergency number). Otherwise, point them to the crisis line: in the US, call or text **988**. Prayer Tower helps you notice and reach out. It does not replace professional help.

## 1. Roles and where your tools are

| Role | Sees | Where in the app |
|---|---|---|
| **Moderator** | Moderation queue, appeals, automated-tap flags, Macro Needs, Witness team | Me → Moderation queue |
| **Pastor / counselor** | Care queue (every kind of care request) | Messages → Pray with someone now |
| **Prayer partner** | Care queue ("Pray with me" requests only) | Messages → Pray with someone now |
| **Witness team** | Sincere needs marked from requests, with private team notes | Me → Witness team |
| **Admin** | Everything above, plus settings, invite codes, announcements and the audit log | Me → Admin |

- **Getting a role:** an admin grants it with `npm run grant-role -- <email> <role>`. The role names are `moderator`, `pastor_counselor`, `prayer_partner`, `witness` and `admin`.
- **Everything is recorded:** every staff action goes to the audit log (Admin → Audit log). Witness notes are logged without their text.

## 2. Your daily routine (about 10 minutes)

1. **Open the moderation queue** (moderators). Clear anything marked **May need support** first. These items are always at the top.
2. **Open the care queue** (pastors and prayer partners). Anyone marked **May be in danger** is at the top.
3. **Check Appeals and automated-tap flags** (moderators), at the bottom of the moderation screen.
4. **Pick up your messages.** Care conversations and Witness cases continue in Messages.

Agree on a backup for days you can't check. The pilot checklist asks for at least one moderator and a named backup (PILOT_LAUNCH_CHECKLIST.md §4).

## 3. Crisis: someone may be in danger

### What the app does by itself

- **Flagging.** A request, comment or private message that mentions suicide or self-harm is flagged automatically. The AI check flags it too, when it rates the text as self-harm.
- **The post stays up.** It is marked so that every reader sees the crisis line box ("call or text 988 any time" in the US). The country is set by `CRISIS_COUNTRY`.
- **Moderators hear at once.** They get a push notice titled **Someone may be in danger**; if there are no moderators, admins get it. The notice never includes what the member wrote, and it can't be turned off.
- **No amplification.** A flagged post gets no extra reach and no radio prayer until a moderator has reviewed it.
- **Care requests.** If a care request mentions danger, pastors, prayer partners and moderators are all told, and it goes to the top of the care queue.

### What you do

The 988 Lifeline's guidance for online communities ([Support on social media](https://988lifeline.org/help-someone-else/support-on-social-media/)):

- **If the risk is imminent,** call 911. "Local emergency services are the fastest way to help a person who is at imminent risk."
- **If it is not imminent,** reach out to the person directly through the platform.
- **Your role** is to support the person and connect them to crisis resources, not to act as a mental health professional.

In Prayer Tower, that means:

1. **Read the item** in the moderation queue (it is marked **May need support**).
2. **Reach out privately** with a short, warm message. Open their profile, or take their care request, and send it. You can follow the #BeThe1To steps ([the 5 steps](https://bethe1to.com/bethe1to-steps-evidence/)):
   - **Ask** directly whether they are thinking about suicide, and listen without judgment.
   - **Be there.** Only promise what you can do.
   - **Help keep them safe.** Ask how close the danger is.
   - **Help them connect** with 988, a counselor or someone they trust.
   - **Follow up** later, and keep your promises.
3. **Decide the item:**
   - **Reached out, keep it:** the post stays up. Prayer for them continues, and amplification is allowed again.
   - **Remove method details:** use this only when the text describes ways of self-harm. The member gets a kind notice saying they can post the prayer again without those details, along with the crisis line.
4. **If you think someone is in immediate danger and you know where they are,** call 911. Then tell an admin, and write a short note on the decision. The note is kept in the audit log.

**Don't:**
- debate or shame the person
- promise to keep danger secret
- share what they wrote outside the staff team
- remove a prayer request only because it mentions pain or suicidal feelings; keep it up and reach out

Crisis lines by pilot country (set by `CRISIS_COUNTRY`):
- US: 988
- Canada: 9-8-8
- UK and Ireland: Samaritans, 116 123

## 4. The moderation queue

Items come from three places:

- **May need support:** crisis flags (§3).
- **Flagged automatically:** the AI check, when `MODERATION_PROVIDER` and its key are set. The AI never penalizes anyone. For the worst categories it hides the content until a person decides: sexual content involving minors, threats, graphic violence, self-harm instructions and violent illegal activity.
- **Reported by a member:** reports from the ⋯ menu on any request, comment, encouragement, message or event.

For each item you see what was written, why it is in the queue, and the buttons below.

| Button | What happens |
|---|---|
| **Keep it** | Dismisses the item. Content an AI flag had hidden comes back. Content already removed or deleted stays gone. |
| **Remove** | Removes the content. Choose the **rule broken** first, because the member is told which rule it was and that they can appeal. |
| **Remove and suspend 7 days** | As Remove, and the member can't post for 7 days. A suspended member can still appeal, report, block, read and delete their account. |

- **Rules you can cite:**
  - Pray for good, never for harm
  - No flooding for a side
  - No ads
  - No harassment or abuse
  - No details of suicide or self-harm methods
  - Community rules (general)
- **Larger penalties:** taking away tokens (a forfeit or a clawback) and longer suspensions are available through the moderation API. Agree them with an admin first.
- **Your own content:** you can't decide reports about yourself. Another moderator has to.
- **Tone:** the member's notice is written to be kind and never shaming. Keep any note you add the same way.

## 5. Appeals

- **How a member appeals:** from the removal notice. There is one appeal per decision.
- **Where they show:** under **Appeals** on the moderation screen, with the rule, any suspension and the member's message.
- **Keep the decision:** the member is told the decision stands.
- **Overturn and restore:** the content comes back, any suspension from that decision is lifted, and the member is told.
- **Who decides:** a different moderator from the one who made the decision, where possible. You can't decide an appeal of your own.

## 6. Automated-tap flags

- **What they are:** prayer taps that look automated, such as too many in an hour, or taps spaced almost exactly alike. They appear under **Prayer taps that look automated**.
- **Nothing happens by itself.** Open the profile to look closer, then choose **Looks human** or **Likely automated**. Both only record your judgment.
- **If you think someone is using a bot,** use a moderation report or speak to an admin. The Terms forbid bots, and tokens earned that way can be clawed back.

## 7. The care queue (pastors and prayer partners)

- **Who asks:** members ask from Messages → **Pray with someone now**.
  - "Pray with me" requests go to prayer partners and pastors.
  - Pastor requests go to pastors only.
  - Confession is switched off until a lawyer reviews it.
- **Taking a request:** tap **Reach out**. The request is yours, and you and the member get a private care conversation in Messages. The member is told someone is with them.
- **Closing it:** close the request when you're done. Either of you can close it.
- **Boundaries:**
  - Pray with them and encourage them.
  - Don't give medical, legal, financial or mental health advice (Terms §3).
  - If they mention danger, follow §3.
- **Privacy:** keep what members share private. Don't copy it outside the app.

## 8. The Witness team

- **What it is for:** needs that someone marked as sincere from a request's page (for example groceries, rent or a visit).
- **Status:** set each case to Watching, Reaching out, Helped or Closed.
- **Notes:** add notes as you go. They stay inside the team, and the audit log records that a note was added, not what it says.
- **Help sent:** log the help when you send it, for example "groceries".

## 9. When to call an admin

- Someone is in immediate danger. Call 911 first.
- A threat against a person, or anything involving a minor.
- A pattern of abuse across several accounts, or a likely bot.
- Anything you're unsure about. It's fine to leave an item pending for a second opinion, except a crisis item: reach out first, then ask.

## Sources

- 988 Suicide & Crisis Lifeline, [Support on social media](https://988lifeline.org/help-someone-else/support-on-social-media/) and [Help someone else](https://988lifeline.org/help-someone-else/).
- #BeThe1To, [the 5 action steps](https://bethe1to.com/bethe1to-steps-evidence/).
- **Not yet reviewed:** the crisis section needs review by a licensed counselor before the pilot (STEVE_TODO.md).
