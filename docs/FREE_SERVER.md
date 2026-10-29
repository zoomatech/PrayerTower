# One free server instead of Fly.io

The API, the worker and the web app can run on one Oracle Cloud Always Free server for $0, in place of Fly.io (about $10 a month). Supabase stays on Supabase Cloud. `scripts/go-live.sh` deploys to it when `DEPLOY_TARGET=server`. Docker runs on the server, not on your Mac.

## What's free

Oracle's Always Free tier ([Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)):

- Arm (Ampere A1): 2 OCPUs and 12 GB of memory in total.
- 200 GB of disk.
- 10 TB of outbound data a month.

Oracle may reclaim an Always Free server that stays idle for 7 days. It counts a server as idle when, over that week, CPU and network use both stay under 20%, plus memory on Arm servers. Oracle's notice to free users says that converting the account to Pay As You Go keeps idle servers running, with no charge while usage stays within the Always Free limits ([51sec, quoting Oracle's email](https://blog.51sec.org/2023/02/oracle-cloud-cleaning-up-idle-compute.html)).

## Steps (once, about 30 minutes)

1. **Make the server.** In the Oracle Cloud console, go to **Compute → Instances → Create instance**.
   - Image: **Ubuntu 24.04**.
   - Shape: **VM.Standard.A1.Flex** (Ampere) with 2 OCPUs and 12 GB.
   - Add your Mac's SSH public key (`~/.ssh/id_ed25519.pub`).
   - Write down the public IP address, for example `203.0.113.5`.
2. **Open ports 80 and 443 in Oracle's network.** Go to **Networking → Virtual Cloud Networks → your VCN → public subnet → Default Security List → Add Ingress Rules**.
   - Add one rule for destination port 80 and one for 443.
   - Use source CIDR `0.0.0.0/0` and protocol TCP.
   - Oracle's steps: [Install Apache on an Ubuntu instance](https://docs.oracle.com/en-us/iaas/Content/developer/apache-on-ubuntu/01oci-ubuntu-apache-summary.htm).
3. **Set up the server** from the repo folder on your Mac:
   ```bash
   scripts/server-setup.sh ubuntu@203.0.113.5
   ```
   The script does four things:
   - Installs Docker from Docker's own apt repository ([Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)).
   - Opens ports 80 and 443 in the server's own firewall. Oracle's Ubuntu images block them.
   - Adds 4 GB of swap for the image builds.
   - Makes `/opt/prayertower`.

   It is safe to run again.
4. **Choose the two addresses.** Without a domain, use sslip.io names, which point at the IP inside them ([sslip.io](https://sslip.io)). Caddy gets their HTTPS certificates from Let's Encrypt by itself. Add these lines to `deploy/production.env`:
   ```
   DEPLOY_TARGET=server
   SERVER_SSH=ubuntu@203.0.113.5
   EXPO_PUBLIC_API_URL=https://api.203-0-113-5.sslip.io
   WEB_APP_URL=https://app.203-0-113-5.sslip.io
   CORS_ORIGINS=https://app.203-0-113-5.sslip.io
   ```
   With a domain (STEVE_TODO B6), point `api.` and `app.` names at the IP, and use those names here instead.
5. **Go live** as usual:
   ```bash
   scripts/go-live.sh --check
   scripts/go-live.sh
   ```
   It does three things:
   - Copies this commit's code and the settings to the server. The settings leave out the Supabase CLI password and access token.
   - Builds the web app on your Mac and sends it to the server.
   - Runs `docker compose -f deploy/server/compose.yml up -d --build` there.

   It ends with "Live" only when both addresses answer.

## Day to day

- **Logs:**
  ```bash
  ssh ubuntu@203.0.113.5 'cd /opt/prayertower && docker compose -f deploy/server/compose.yml logs -f api worker'
  ```
- **Deploy a fix:** run `scripts/go-live.sh` again. The release name (date and commit) is saved in `/opt/prayertower/RELEASE`.
- **Roll back:** check out the earlier commit and run `scripts/go-live.sh` again.
- **Uptime alerts:** the same two monitors as STEVE_TODO A11, on `https://api.…/health` and `https://api.…/health/ready`.
- **Visitor addresses:** Caddy passes the visitor's address in `X-Real-IP`, and the API reads it (`CLIENT_IP_HEADER=x-real-ip`). `/metrics` is not reachable from the internet.

## Files

- [deploy/server/compose.yml](../deploy/server/compose.yml): the API, the worker and Caddy.
- [deploy/server/Caddyfile](../deploy/server/Caddyfile): HTTPS for both addresses, and the web app's caching rules.
- [scripts/server-setup.sh](../scripts/server-setup.sh): the one-time setup.
