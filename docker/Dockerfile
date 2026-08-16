# One file, four services. The point is the `deps` stage: with separate
# Dockerfiles each service installed the whole workspace for itself, four
# concurrent installs saturated the registry, and the build failed on reset
# connections rather than on anything to do with this repository. Sharing one
# stage means the install happens once and the rest is cached.

FROM node:24-slim AS deps
RUN corepack enable
WORKDIR /repo

# Manifests first, so the install layer is rebuilt only when a dependency
# changes rather than on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/marketplace/package.json apps/marketplace/
COPY apps/vault-console/package.json apps/vault-console/
COPY apps/admin/package.json apps/admin/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
COPY packages/test-support/package.json packages/test-support/
COPY e2e/package.json e2e/

# Husky has no business in an image and no .git to attach to.
ENV HUSKY=0
RUN pnpm config set network-concurrency 8 \
  && pnpm config set fetch-retries 5 \
  && pnpm install --frozen-lockfile

COPY . .

# ---------------------------------------------------------------------------

# The api runs its TypeScript directly through @swc-node/register, the same way
# `pnpm start` does, so this keeps the development dependencies rather than
# compiling first. A larger image, in exchange for the container running
# exactly what a developer runs with no build step that could diverge from it.
FROM deps AS api
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN pnpm --filter @depawn/api exec prisma generate
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]

# ---------------------------------------------------------------------------

# The three front ends differ only in which workspace is built. They import
# the contracts and ui packages from source, so building one needs the whole
# workspace present even though a single dist comes out.
FROM deps AS web-build
ARG APP=marketplace
RUN pnpm --filter "@depawn/${APP}" run build \
  && cp -r "apps/${APP}/dist" /tmp/dist

FROM nginx:1.27-alpine AS web
COPY --from=web-build /tmp/dist /usr/share/nginx/html
COPY docker/web.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
