# v10.0

- Ozon browser moved from the user's PC to a dedicated Timeweb Cloud Server.
- Persistent graphical Chromium profile stored on the VPS disk.
- One-time Ozon login through password-protected noVNC over an SSH tunnel.
- Ozon jobs still use the PostgreSQL-backed cloud queue introduced in v9.6.
- Each Ozon lookup opens a separate tab and closes it after a successful read.
- Anti-bot/login challenge tabs stay open so the user can resolve them through noVNC.
- Ozon proxy, if needed, is configured only on the VPS worker, not in App Platform.
