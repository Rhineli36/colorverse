FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY docs/schemas ./docs/schemas
RUN pnpm install --frozen-lockfile
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN VITE_EXHIBITION_MODE=false VITE_ENABLE_CLOUD_AUTH=true VITE_USE_AUTH_PROXY=true pnpm build

FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY --from=build --chown=node:node /app /app
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start:server"]
