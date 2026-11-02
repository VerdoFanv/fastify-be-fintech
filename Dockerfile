FROM node:22-alpine AS build
WORKDIR /app
# .npmrc (legacy-peer-deps) required — eslint peer conflict without it
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Dummy URL only for `prisma generate` during image build (runtime uses K8s Secret)
ENV DATABASE_URL=postgresql://postgres:postgres@postgres:5432/fastify_be_fintech?schema=public
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev \
  && npm install prisma@7.10.1 --omit=dev --no-save

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# tsc-alias --resolve-full-paths rewrites imports to /app/src/generated/...
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
