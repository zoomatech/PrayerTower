# Communities (sandboxes)

A community is a separate feed with its own members, post types and wording. The pilot ships two: **Christian (ecumenical)**, the default, and **Open Circle**, the non-religious one (docs/OPEN_CIRCLE.md, hidden until turned on).

Admins can add more under **Admin → Communities → New community**, for example a denomination's own sandbox, or a space leased to a partner organisation or another tradition (Notes Page 16).

- **Short name** (`grace-lutheran`): used in links and settings. It can't change later.
- **Tradition** (free text, e.g. `lutheran`, `jewish`, `secular`).
- **Wording:** *faith* uses the Prayer Tower words (pray, prayer, praise); *neutral* uses the Open Circle words (support, good news) and drops confessionals.
- **Operator** and **operator contact:** who runs or leases it. Shown to admins only.
- **Description:** shown to members when they choose a community.

A new community starts **hidden**: members can't see or join it until an admin sets it to active. The neutral wording toggle can be changed later on each community.

API: `POST /admin/communities` (201; 409 if the short name is taken) and `PATCH /admin/communities/:slug` (adds `wording`, `description`, `operatorName`, `operatorContact`). Migration `20261029004500_community_sandboxes.sql`.
