FROM node:22-bookworm-slim AS deps
WORKDIR /workspace/apps/ui

# Install deps (cached layer)
COPY apps/ui/package.json apps/ui/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /workspace/apps/ui
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js inlines NEXT_PUBLIC_* at build time; provide via build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG AUDIO_QUALITY_DEFAULT
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_APP_COMMIT
ARG NEXT_PUBLIC_BUILD_TIMESTAMP
ARG APP_ROLLOUT_PROFILE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV AUDIO_QUALITY_DEFAULT=$AUDIO_QUALITY_DEFAULT
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_COMMIT=$NEXT_PUBLIC_APP_COMMIT
ENV NEXT_PUBLIC_BUILD_TIMESTAMP=$NEXT_PUBLIC_BUILD_TIMESTAMP
ENV APP_ROLLOUT_PROFILE=$APP_ROLLOUT_PROFILE

COPY --from=deps /workspace/apps/ui/node_modules ./node_modules
COPY apps/ui/ ./
COPY packages/shared/ /workspace/packages/shared/
RUN npm run build

# Production image: Next standalone output
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Optional at runtime (most client usage is inlined at build).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG AUDIO_QUALITY_DEFAULT
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_APP_COMMIT
ARG NEXT_PUBLIC_BUILD_TIMESTAMP
ARG APP_ROLLOUT_PROFILE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV AUDIO_QUALITY_DEFAULT=$AUDIO_QUALITY_DEFAULT
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_COMMIT=$NEXT_PUBLIC_APP_COMMIT
ENV NEXT_PUBLIC_BUILD_TIMESTAMP=$NEXT_PUBLIC_BUILD_TIMESTAMP
ENV APP_ROLLOUT_PROFILE=$APP_ROLLOUT_PROFILE

COPY --from=builder /workspace/apps/ui/public ./public
COPY --from=builder /workspace/apps/ui/.next/standalone ./
COPY --from=builder /workspace/apps/ui/.next/static ./.next/static
# Translation prompts use dynamic runtime filenames and are not discovered by
# Next's standalone file tracer. Keep them beside the server bundle explicitly.
COPY --from=builder /workspace/apps/ui/lib/translation/prompts/*.txt ./lib/translation/prompts/

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
