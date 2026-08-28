# PriceWatch v9.5.2

- Fix Timeweb deploy regression introduced in v9.5/v9.5.1.
- The HTTP server no longer runs under `xvfb-run`.
- Xvfb starts as a background process and `npm start` remains PID 1.
- `/api/health` can come online even if the virtual display fails.
- Ozon proxy/stealth logic from v9.5 is unchanged.
