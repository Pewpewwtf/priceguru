FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb x11vnc novnc websockify openbox dbus-x11 xterm \
      fonts-liberation fonts-noto-color-emoji ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY worker.js ozon-parser.js start.sh ./
RUN chmod +x /app/start.sh && mkdir -p /data/chrome-profile /data/logs

EXPOSE 6080
CMD ["/app/start.sh"]
