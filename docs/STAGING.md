# Staging

Staging is a full copy of the stack with its own data, used to try a release before production. It has three parts.

## 1. A staging Supabase project

Create a second Supabase project (the Free plan is enough), then apply this repo's migrations to it:

```bash
npx supabase link --project-ref <staging-ref>
npx supabase db push
npx supabase link --project-ref <production-ref>   # link back afterwards
```

Set its Auth Site URL and SMTP as for production. The demo seed only runs against a local stack, so make staging accounts by signing up in a staging build, and grant roles with `npm run grant-role` pointed at staging.

## 2. The staging API and worker

They run on the same server as production, as a second Docker Compose project on port 3100:

```bash
cp deploy/staging.env.example deploy/staging.env   # gitignored; fill in the staging values
ENV_FILE=deploy/staging.env API_PORT=3100 docker compose -p prayertower-staging up -d --build
curl -s localhost:3100/health
```

Uncomment the staging block in `deploy/Caddyfile`, set its domain (for example `staging-api.<your-domain>`), and reload Caddy. `SENTRY_ENVIRONMENT=staging` keeps its errors apart from production's.

## 3. Staging app builds

The `staging` EAS profile sets `APP_VARIANT=staging`. `apps/mobile/app.config.js` then names the app "Prayer Tower (Staging)" with the bundle ID `com.zoomatech.prayertower.staging`, so it installs next to the store app ([Expo: multiple app variants](https://docs.expo.dev/tutorial/eas/multiple-app-variants/)). It uses the EAS `preview` environment, so point that environment at staging ([EAS environment variables](https://docs.expo.dev/eas/environment-variables/)):

```bash
cd apps/mobile
eas env:set --environment preview --name EXPO_PUBLIC_API_URL --value https://staging-api.<your-domain> --visibility plaintext
eas env:set --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<staging-ref>.supabase.co --visibility plaintext
eas env:set --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <staging publishable key> --visibility plaintext
eas env:set --environment preview --name EXPO_PUBLIC_SENTRY_ENVIRONMENT --value staging --visibility plaintext
eas build --profile staging --platform all
```

The new bundle ID needs its own signing: EAS offers to create the iOS provisioning profile on the first build.

## Release flow (default)

1. Merge to `main`; CI is green.
2. `db push` the migrations to staging, redeploy the staging API, and build the staging app.
3. Run through the pilot checklist on staging.
4. Then do the same for production.

## Open question

Staging and the `preview` profile share the EAS `preview` environment, so preview builds also talk to staging. That is the default here. A separate `staging` environment needs an EAS plan with custom environments.
