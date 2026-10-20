# One image, two processes: the web process is the default command, the
# worker runs from the same image with `node dist/worker.js`. No host-specific
# configuration and no HEALTHCHECK (the worker shares the image); see README "Deploy".

# Playwright base pinned to the Playwright npm version (Node 24 + npm, user pwuser).
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# next build (.next/standalone) + esbuild bundles dist/worker.js and dist/preflight.js
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.63.0-noble AS runtime
# The base image ships no system ffmpeg; pin Ubuntu noble's build (ffmpeg and ffprobe, for video renditions).
# tini is PID 1 for both processes: it forwards SIGTERM/SIGINT and reaps the ffmpeg children.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg=7:6.1.1-3ubuntu5 tini=0.19.0-1 \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# Standalone output does not include static assets; there is no public/ dir.
COPY --from=build --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=build --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=build --chown=pwuser:pwuser /app/dist ./dist
# dist/worker.js leaves sharp (a native module, renditions since Story 3.2) external: it
# resolves ./node_modules/sharp. Next's standalone tracing already includes it; copy it
# and its runtime dependencies (its own semver is nested inside it) explicitly so the
# worker never depends on that tracing.
COPY --from=build --chown=pwuser:pwuser /app/node_modules/sharp ./node_modules/sharp
COPY --from=build --chown=pwuser:pwuser /app/node_modules/@img ./node_modules/@img
COPY --from=build --chown=pwuser:pwuser /app/node_modules/detect-libc ./node_modules/detect-libc
USER pwuser
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
# The preflight runs the env and basic-auth checks before server.js opens the port.
CMD ["node", "--require", "./dist/preflight.js", "server.js"]
