# Install ffmpeg so .MOV from celular can be converted to .MP4 for browser playback
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
