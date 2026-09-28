# amo-sync — AmoCRM → Supabase Postgres copy, cashback expiry, Telegram receipts (see src/index.ts).
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY src ./src
COPY fonts ./fonts
COPY assets ./assets
USER bun
CMD ["bun", "run", "src/index.ts"]
