# What the 10-member pilot costs to run

Prices were checked on 2026-10-28 on each company's own pricing page, linked in every row. Prices change, so check the page again before paying. The stack is the one in `fly.toml`, `deploy/fly-web/fly.toml` and [GO_LIVE.md](GO_LIVE.md). The pilot is iPhone only.

## The short answer

| Choice | Per month |
|---|---|
| **Cheapest that works:** Supabase Free | **about $18**: Fly.io about $10, plus the Apple fee spread over 12 months ($8.25) |
| **Recommended:** Supabase Pro, for daily backups and no pausing | **about $43**: $25 + about $10 + $8.25 |

Add the domain name. Its price depends on the ending (.org, .com). Cloudflare "does not mark up domain prices at all" ([Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)).

Everything else fits in a free plan at 10 members.

## Line by line

| Service | What Prayer Tower uses it for | Plan | Per month | Source |
|---|---|---|---|---|
| **Supabase** | Database, sign-in, photo storage | Free: "500 MB database size", 50,000 monthly users, 1 GB file storage, 5 GB egress. "Free projects are paused after 1 week of inactivity", and there are no automatic backups. | **$0** | [Supabase pricing](https://supabase.com/pricing) |
| | | Pro: "from $25/month", with $10 of compute credit that covers one Micro instance ($10). 8 GB disk, 100 GB file storage, 250 GB egress, daily backups kept 7 days. | **$25** | same |
| **Fly.io** | The API and the background worker (one app, two machines, `shared-cpu-1x`, 512 MB each), and the web app (256 MB, stops when nobody uses it) | Pay as you go. shared-cpu-1x: 512 MB $3.69 a month, 256 MB $2.19 a month (Ashburn). There is no free allowance; new accounts get a trial of "up to 2 hours of Machine runtime or 7 days". | **about $9.57** at most: $3.69 × 2 + $2.19. Less when the web app is stopped. | [Fly.io pricing](https://docs.fly.io/about/pricing) |
| | Outbound data | $0.02 per GB in North America. 10 members use far less than 1 GB of API traffic a month. | **under $0.10** | same |
| | Dedicated IPv4 address | $2 a month, only if one is added. The setup doesn't add one. | $0 | same |
| **Apple Developer Program** | TestFlight and the App Store | "$99 annual membership". Nonprofits recognized by the IRS, accredited schools and government bodies can ask for a fee waiver, unless they sell anything in their apps. | **$8.25** ($99 a year) | [Apple Developer Program](https://developer.apple.com/programs/), [fee waivers](https://developer.apple.com/help/account/membership/fee-waivers) |
| **Expo EAS** | iPhone builds and over-the-air updates | Free: "15 Android and 15 iOS builds" a month, low-priority queue, updates to 1,000 monthly users. Starter is "$19/month" if faster builds are wanted. | **$0** | [Expo pricing](https://expo.dev/pricing) |
| **Expo push** | Notifications | "There is no cost associated with sending notifications through Expo push notification service." | **$0** | [Expo push FAQ](https://docs.expo.dev/push-notifications/faq/) |
| **Sentry** | Crash reports (optional) | Developer (Free): 1 user, 5,000 errors, 30-day lookback. Team is "$29/mo monthly". | **$0** | [Sentry pricing](https://sentry.io/pricing/) |
| **Email (SMTP)** | Sign-up and password emails, invite codes, the weekly email | Resend is one example. Its Free plan has 3,000 emails a month and is "limited to 100 emails per day", with SMTP. Pro is $20 a month. 10 members send a few dozen a week. | **$0** | [Resend pricing](https://www.resend.com/pricing) |
| **OpenAI moderation** | The automatic safety check | The moderation endpoint is free for API users ("es gratuito"), and doesn't count toward usage limits. | **$0** | [OpenAI help](https://help.openai.com/es-419/articles/4936833-is-the-moderation-endpoint-free-to-use) |
| **UptimeRobot** | Emails you when the API or worker stops | Free: 50 monitors, checked every 5 minutes, "No credit card required". | **$0** | [UptimeRobot](https://uptimerobot.com/) |

## Which Supabase plan

- **Free works** while members use the app every week, because a project only pauses after a week with no activity.
- **Free has no backups.** If you stay on Free, run `scripts/backup-db.sh` every day from your Mac ([BACKUP_RESTORE.md](BACKUP_RESTORE.md)). It keeps 30 days of copies.
- **Pro adds** daily backups and no pausing. Because of that, Pro is the recommendation from the first real member onwards.

## What would raise the bill

- **Video.** Photos and videos count against storage and egress. On Free, the limits are 1 GB of storage and 5 GB of egress a month.
- **Faster builds.** EAS Starter is $19 a month, and it's only needed if the free queue is too slow.
- **More Sentry users.** The free plan has 1 user. Team is $29 a month.
- **The radio station.** It runs on your own Raspberry Pi and radio, so it has no monthly fee here, apart from the power and internet it uses.
