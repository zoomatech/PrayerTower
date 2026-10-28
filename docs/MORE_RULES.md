# More community rules

Two optional rules, each off by default (Admin → Notebook ideas). They work like the
"Don't pressure people" rule: while a switch is off the
rule is hidden from Community rules, moderators can't pick it, and the server refuses it.

| Rule | Switch | What it covers |
| --- | --- | --- |
| No misleading claims | `notebook_settings.misleading_rule_enabled` | False health, money or safety claims, made-up quotes or news, and edited media meant to fool people. Opinions and rumors are fine when labeled. |
| No automated accounts | `notebook_settings.automation_rule_enabled` | Bots and scripts that post, react or message for a member, accounts made for someone else, and AI-written posts passed off as the member's own words. |

Source: Project Management Document, section 6.3 (misinformation; AI agents posing as members).
The wording has no religious words, so both rules read the same in Open Circle.

Tests: `apps/server/test/more-rules.test.ts`.
