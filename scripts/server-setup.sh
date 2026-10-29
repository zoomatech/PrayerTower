#!/usr/bin/env bash
# One-time setup of a free server for Prayer Tower (docs/FREE_SERVER.md), run
# from the repo folder on your Mac:
#   scripts/server-setup.sh ubuntu@203.0.113.5
# Over SSH it installs Docker (https://docs.docker.com/engine/install/ubuntu/),
# opens ports 80 and 443 in the server's own firewall (Oracle's Ubuntu images
# block them: https://docs.oracle.com/en-us/iaas/Content/developer/apache-on-ubuntu/01oci-ubuntu-apache-summary.htm),
# adds 4 GB of swap for the image builds, and makes /opt/prayertower.
# Safe to run again. Then deploy with DEPLOY_TARGET=server scripts/go-live.sh.
set -euo pipefail
target=${1:?usage: scripts/server-setup.sh user@server-address}

ssh -o StrictHostKeyChecking=accept-new "$target" 'bash -s' <<'REMOTE'
set -euo pipefail
. /etc/os-release
[ "$ID" = ubuntu ] || { echo "server-setup: this script expects Ubuntu (found $ID)" >&2; exit 1; }

if ! command -v docker >/dev/null; then
  echo "==> Installing Docker"
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<SOURCES
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
SOURCES
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo usermod -aG docker "$USER"

echo "==> Opening ports 80 and 443"
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 1 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p udp --dport 443 -j ACCEPT
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save >/dev/null; fi

if ! swapon --show | grep -q /swapfile; then
  echo "==> Adding 4 GB of swap"
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

sudo mkdir -p /opt/prayertower && sudo chown "$USER" /opt/prayertower
echo "Server ready: $(uname -m), $(nproc) CPU, $(free -g | awk '/Mem/ {print $2}') GB memory."
REMOTE
echo "Next: in deploy/production.env set DEPLOY_TARGET=server and SERVER_SSH=$target, then run scripts/go-live.sh (docs/FREE_SERVER.md)."
