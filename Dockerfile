# Two stages: build the static site, then run the small server that serves it.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY astro.config.mjs ./
COPY src ./src
COPY content ./content
COPY public ./public
COPY tools ./tools
COPY server ./server
COPY migrations ./migrations
COPY test ./test
COPY vault/seed ./vault/seed
COPY docs/phase-1/inventory.json ./docs/phase-1/inventory.json
ARG PUBLIC_STAGING=0
ENV PUBLIC_STAGING=$PUBLIC_STAGING
# Cloudflare Turnstile site key (public). Empty: the quote page has no widget.
ARG PUBLIC_TURNSTILE_SITEKEY=
ENV PUBLIC_TURNSTILE_SITEKEY=$PUBLIC_TURNSTILE_SITEKEY
RUN npx astro telemetry disable && npm run build
# A production image is only built when the launch-freeze check and the tests pass.
# (A staging build writes noindex into every page, which the freeze check would rightly refuse.)
RUN if [ "$PUBLIC_STAGING" != "1" ]; then npm run check:inventory && node --test; fi

FROM node:24-alpine
# Business hours, form timestamps and lead dates are all New York time, matching
# gigfriend-server. Alpine needs tzdata for TZ to take effect.
RUN apk add --no-cache tzdata
ENV TZ=America/New_York NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY content/redirects.json ./content/redirects.json
COPY migrations ./migrations
COPY --from=build /app/dist ./dist
ARG BUILD_SHA=unknown
ENV BUILD_SHA=$BUILD_SHA
EXPOSE 8080
USER node
CMD ["node", "server/server.js"]
