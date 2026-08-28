# PriceGuru v10.0 — exact Timeweb setup

## Part A — update App Platform

1. Upload all v10 files to the ROOT of the existing GitHub repository. Keep the `ozon-vps/` subfolder.
2. In Timeweb App Platform add ENV `OZON_AGENT_KEY` with a long random value.
3. Redeploy.
4. Check `/api/health`: version must be `10.0`, database `postgres`, `ozonAgentConfigured: true`.

## Part B — create the Ozon browser VPS

Recommended start configuration: Ubuntu 24.04, 2 vCPU, 4 GB RAM, 30 GB NVMe, public IPv4.

After creating the server, open its Timeweb Console or SSH as root and run:

```bash
apt update && apt install -y git curl
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

Clone the SAME GitHub repository used by PriceGuru:

```bash
git clone YOUR_GITHUB_REPOSITORY_URL /opt/priceguru
cd /opt/priceguru/ozon-vps
bash configure.sh
```

The configurator asks for:

- PriceGuru cloud URL
- `OZON_AGENT_KEY` (same value as App Platform)
- a new VNC password
- optional Ozon proxy URL

Then start the worker:

```bash
docker compose up -d --build
bash status.sh
```

## Part C — log in to Ozon once

The noVNC screen is intentionally bound only to `127.0.0.1` on the VPS. From your own computer open an SSH tunnel:

```bash
ssh -L 6080:127.0.0.1:6080 root@YOUR_VPS_PUBLIC_IP
```

Keep that terminal open and open in your normal browser:

```text
http://127.0.0.1:6080/vnc.html?autoconnect=1&resize=scale
```

Enter the VNC password created in `configure.sh`.

A Chromium window is already running on the VPS. Open Ozon, log into your normal Ozon account and complete any verification. The browser profile is stored in `/opt/priceguru/ozon-vps/data/chrome-profile` and survives worker/container restarts.

After login, close only the SSH tunnel/browser tab on your computer. Do NOT close Chromium inside noVNC. The worker keeps running on the VPS 24/7.

## Part D — verify

Open PriceGuru `/api/health`. It should show `ozonAgentOnline: true`.

Then add an Ozon product. The worker opens a new Ozon tab on the VPS, reads the product, closes the tab, and sends the result back to PostgreSQL.

## Useful VPS commands

```bash
cd /opt/priceguru/ozon-vps
bash status.sh

docker compose restart

docker compose logs -f ozon-browser
```

To update the VPS worker after a future GitHub version:

```bash
cd /opt/priceguru/ozon-vps
bash update.sh
```
