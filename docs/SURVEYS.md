# Surveys

Admin → Surveys lets staff ask members a few questions. Nothing is shown to members until an admin opens a survey.

## How it works

1. **Write a draft.** Give it a title, an optional intro, and up to 30 questions. Each question is one of: one answer, several answers, a 1 to 5 scale, or a written answer. A question can be marked "must answer".
2. **Choose who sees it.** Leave the community blank for everyone, or enter a community's short name (for example `open-circle`) to ask only that community. "Everyone" means every faith community: Open Circle and other neutral communities never see it and get only surveys made for them.
3. **Open it.** Members see it at the top of their feed ("A short survey: …") until they answer. Each member answers once.
4. **Close it** when you have enough answers. Closed surveys stop taking answers.

## Privacy

- **Anonymous** is on by default. The answers are stored with no member id. A separate list records only *who has answered* (so nobody answers twice), and it is not linked to the answers. The answer row keeps only the day, not the time.
- **Results are totals only:** counts per choice, the scale average, and written answers in random order with no names.
- An anonymous survey shows **no results until 5 people have answered** (`MIN_RESPONSES` in `apps/server/src/modules/surveys/index.ts`), so nobody can be picked out.
- Once anyone has answered, the questions and the anonymous setting can't change, and the survey can't be deleted (close it instead). This keeps every answer tied to the question the member actually saw.

## The notebook survey

Migration `20261029004600_surveys.sql` adds the draft **"Praying for everyone"** for the default (Christian) community, from Notes p2 ("Should there be a survey identifying pro-gay or other mistreated Christians from people who will either refuse to pray for them, or abuse them, or attempt to convert them?"). It asks whether members have been refused prayer, mocked or pressured, why, whether they'd pray for any Christian, and how safe they feel. It stays a draft until an admin edits and opens it.

## API

| Who | Method and path | What it does |
| --- | --- | --- |
| Member | `GET /surveys` | Open surveys for my community that I haven't answered |
| Member | `POST /surveys/:id/responses` | `{ answers: [{ questionId, choices?, value?, text? }] }` |
| Admin | `GET /admin/surveys` | Every survey, with its answer count |
| Admin | `POST /admin/surveys` | New draft |
| Admin | `PATCH /admin/surveys/:id` | Edit; `status: open \| closed \| draft` |
| Admin | `DELETE /admin/surveys/:id` | Only while nobody has answered |
| Admin | `GET /admin/surveys/:id/results` | Totals |

Admin changes are recorded in the audit log.
