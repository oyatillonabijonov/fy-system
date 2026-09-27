# amo-sync — AmoCRM → Supabase Postgres copy (see src/index.ts).
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile
COPY src ./src
USER bun
CMD ["bun", "run", "src/index.ts"]
