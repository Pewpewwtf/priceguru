FROM mcr.microsoft.com/playwright:v1.62.1-noble
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates xvfb \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8080
# Start the web server independently from Xvfb. Xvfb is only needed by the headed Ozon browser.
# If Xvfb has a problem, /api/health still stays online and Timeweb does not roll back the deploy.
CMD ["bash", "-lc", "Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp -ac >/tmp/xvfb.log 2>&1 & export DISPLAY=:99; exec npm start"]
