# Podcasts

Staff podcasts that members hear in the app, with a public RSS feed for podcast apps. Source: Notes p7 ("live seminars, podcasts, in-app video").

**Off by default.** Turn it on in Admin → Notebook ideas → Podcasts. While it is off, members see nothing and every feed returns 404.

## Adding a show

Admin → Podcasts → New show: a short name (it becomes the feed link), title, description, host, optional square artwork link, and optionally one community. A show for a neutral community (such as Open Circle) gets the category "Society & Culture"; others get "Religion & Spirituality".

Then add episodes. **The audio is not uploaded to Prayer Tower.** Host each MP3 or M4A file anywhere that gives an https link (a podcast host, cloud storage, the church website) and paste the link. The server asks the host for the file's size, which podcast apps need. An episode can be published at once or saved as a draft.

A show appears to members (Me → Podcasts) and in its feed only once **both** the show and at least one episode are published.

## Feed for podcast apps

`https://<server>/podcasts/<short name>/feed.xml`, shown on each show in Admin → Podcasts. It is RSS 2.0 with the iTunes namespace and the tags Apple lists: title, description, language, copyright, author, artwork, category, explicit, and for each episode the enclosure (URL, length, type), a GUID that never changes, an RFC 2822 pubDate and the duration. To list the show in Apple Podcasts, submit that feed link in Apple Podcasts Connect.

Sources: [Podcast RSS feed requirements](https://podcasters.apple.com/support/823-podcast-requirements), [RSS feed sample](https://help.apple.com/itc/podcasts_connect/en.lproj/itcbaf351599.html), [Apple Podcasts categories](https://podcasters.apple.com/support/1691-apple-podcasts-categories). Apple requires artwork for a listing: square, 1400 to 3000 pixels.

Data: migration `20261029004900_podcasts.sql`; code `apps/server/src/modules/podcasts/`.
