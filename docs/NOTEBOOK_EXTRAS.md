# More notebook ideas

Found by cross-checking the Development Plan and the Project Management Document against the
ideas inventory. Each is off by default; an admin turns it on under Admin → Notebook ideas
(`notebook_settings`). All of them work in Open Circle.

| Feature | Switch | What members see |
| --- | --- | --- |
| Glowing urgency light | `urgency_glow_enabled` | The light on an urgent (2) or very urgent (3) request glows and pulses, faster when very urgent. It stays still when the device asks for reduced motion. |
| Quick reactions | `reaction_tray_enabled` | Press and hold a post (or use the "Quick reactions" accessibility action) for "Light a candle" 🕯️ and "Standing with you" ❤️. One of each per member per post; the counts show on the card. Stored in `quick_reactions`, included in "Download my data", and removed with the account. |
| Town on profiles | `member_town_enabled` | Members can add a town on Me. Cards read "Carol in Albuquerque", and an ask-to-pray notice reads "Carol in Albuquerque would like you to pray for this", but only for members of the post's community, and never on an anonymous post. The town is cleared when an account is deleted. |
| Award prize choice | `prize_choice_enabled` | On accepting the annual award, the winner chooses to keep the prize, donate it, or split it. The winner is paid the whole token prize, then the donated share (all, or half rounded down) moves to the infrastructure fund, so the ledger shows both. The choice is made once. |

Sources: PM doc 3.8 (reactions, urgency light), PM doc 2 (award prize), Dev Plan 3.5 (town).
Tests: `apps/server/test/notebook-extras.test.ts`.
