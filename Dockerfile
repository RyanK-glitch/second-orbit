# Single-stage image: keeps the migration/seed scripts available at runtime
# so `docker compose up` brings up a fully seeded app with one command.
FROM node:24-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate && npm run db:seed -- --if-empty && npm run start"]
