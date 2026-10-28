# Importing a church's members and prayer requests (CSV)

**Where:** Admin → Invite codes → **Import from a spreadsheet (CSV)**. The API is `POST /admin/import`, for admins only. Each import is recorded in the audit log.

## Getting a CSV file

- **Google Sheets:** File → Download → Comma-separated values (.csv).
- **Excel:** File → Save As → CSV UTF-8.
  - In Spanish, Excel may separate columns with semicolons; those work too.

On the web you can pick the file. On a phone, copy the cells and paste them into the box.

## Members (they become invite codes)

| Column | Needed | Notes |
|---|---|---|
| `email` (or `correo`) | yes | One person per row. |
| `name` (or `nombre`) | no | Shown on the code's note, so you can see who it's for. |
| `language` (or `idioma`) | no | `en` or `es`. If blank, it's the admin's own app language. |

Example:

```
email,name,language
ana@example.org,Ana Ruiz,es
bob@example.org,Bob Lee,en
```

- **One code per person.** Each person gets their own single-use code. It expires after 60 days, and its note reads "<your note>: <name>".
- **Skipped rows:** people who already have an account, and emails listed twice. Rows without a valid email are marked as problems.
- **Email each person their code** (optional): sends the invite email in each person's language. It includes the code, a sign-up link when `WEB_APP_URL` is set, and the store links. It needs `SMTP_URL` on the server. Without it, share the codes from Admin → Invite codes.

## Starter prayer requests

| Column | Needed | Notes |
|---|---|---|
| `request` (or `petición`) | yes | Up to the normal word limit. |
| `anonymous` (or `anónimo`) | no | `yes` or `sí` posts it without a name. |

- **Posted by you.** Each request is posted by the importing admin and goes through the usual checks: safe-messaging and crisis detection, and the AI moderation scan when it is on.
- **Skipped rows:** a request listed twice.

## Preview first

**Preview** checks every row and changes nothing. It lists each row as Ready, Skipped (with why), or Problem. **Import** is enabled only after a preview. The limit is 500 rows per import.
