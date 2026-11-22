# Two stages: build the static site, then run the small server that serves it.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY astro.config.mjs ./
COPY src ./src
COPY content ./content
ARG PUBLIC_STAGING=0
ENV PUBLIC_STAGING=$PUBLIC_STAGING
RUN npx astro telemetry disable && npx astro build

FROM node:24-alpine
# Business hours, form timestamps and lead dates are all New York time, matching
# gigfriend-server. Alpine needs tzdata for TZ to take effect.
RUN apk add --no-cache tzdata
ENV TZ=America/New_York NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY content/redirects.json ./content/redirects.json
COPY --from=build /app/dist ./dist
ARG BUILD_SHA=unknown
ENV BUILD_SHA=$BUILD_SHA
EXPOSE 8080
CMD ["node", "server/server.js"]
