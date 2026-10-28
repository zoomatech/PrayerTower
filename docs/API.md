# API reference (OpenAPI)

The server describes itself as OpenAPI 3.1. The description is built from the routes Fastify actually registers: method, path, path parameters and who may call it. The request bodies and query strings come from the zod schemas the handlers parse (`apps/server/src/openapi-schemas.ts`). A test fails if a schema there stops matching a route.

## Where to find it

- **`/api/openapi.json`** is the spec. Import it into Postman, Insomnia or a client generator.
- **`/api/docs`** is the same spec as a browsable page (Swagger UI 5.33.1, loaded from jsDelivr).

## Who can see it

| Where | Access |
|---|---|
| Local development and staging (not `NODE_ENV=production`) | Open |
| Production with `API_DOCS_PASSWORD` set | Staff only. The browser asks for a user name and password: use any user name and the `API_DOCS_PASSWORD`. An admin's or moderator's `Authorization: Bearer <token>` also works. |
| Production without `API_DOCS_PASSWORD` | `/api/openapi.json` works only for an admin's or moderator's bearer token, and `/api/docs` is off (a browser can't send a bearer token) |

## Auth schemes in the spec

- **`member`**: a Supabase Auth access token, sent as a bearer token. Almost every route uses it.
- **`station`**: the `x-station-key` header used by the radio station.
- **Public routes** (`security: []`) include `/health`, `/signup-config`, the website, the account-deletion page and the shared-post landing pages.

## Errors

- Errors come back as `{ error, message }`.
- Invalid input comes back as `{ error: "invalid_request", issues }`, where `issues` holds the zod issues.
