FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY . .

EXPOSE 3000

ENV NODE_PORT=3000

CMD ["bun", "run", "index.js"]
