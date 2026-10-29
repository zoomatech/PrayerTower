# Sponsor recognition

From the Business Plan, section 11.4 ("Ways to participate"): launch sponsors, founding sponsors of the Common Prayer Fund, Witness team sponsors, token pool sponsors and community space partners are thanked publicly. The plan's rule applies: "sponsors fund prayer reach and help, not promotion."

**It's off by default.** The page is published only when Admin → Sponsors → "Publish the sponsor page" is on (`sponsor_settings.sponsors_page_enabled`). While it's off, the public addresses return "not found".

## What it shows

Each sponsor's name, grouped by what they sponsor (launch, Common Prayer Fund, Witness team, a token pool, a community space, or other), with the pool or community they support, an optional thank-you note of up to 200 characters, and the date they started.

**No ads.** There are no logos, no links and no product names beyond the sponsor's own name. A name or note with a web address is refused. A sponsor never gets a place in anyone's feed.

## Where

| Address | Who |
|---|---|
| `https://<your domain>/sponsors` | Anyone, as a web page |
| `GET /sponsors/list` | Anyone, as JSON |

## Admins

Admin → Sponsors adds a sponsor, and hides or shows one again. Sponsors are never deleted.

```
POST  /admin/sponsors           { "name": "Grace Fellowship", "kind": "fund", "thanks": "A gift for groceries and rent." }
PATCH /admin/sponsors/:id       { "hidden": true }
PATCH /admin/sponsors/settings  { "pageEnabled": true }
GET   /admin/sponsors
```

`kind` is `launch`, `fund`, `witness`, `pool` (needs `poolId`), `community` (needs `communitySlug`) or `other`.
