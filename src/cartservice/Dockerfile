# Copyright 2020 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# syntax=docker/dockerfile:1.6
FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY grpc-server.ts redis.ts types.ts ./
COPY proto/Cart.proto ./proto/Cart.proto
COPY proto/health/health.proto ./proto/health/health.proto
RUN npm run build

FROM node:20-alpine
ARG TARGETOS
ARG TARGETARCH
RUN apk add --no-cache curl && \
    PROBE_VER=v0.4.27 && \
    curl -fsSL \
      https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${PROBE_VER}/grpc_health_probe-${TARGETOS}-${TARGETARCH} \
      -o /usr/local/bin/grpc_health_probe && \
    chmod +x /usr/local/bin/grpc_health_probe

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=7070
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/proto ./proto
EXPOSE 7070
CMD ["node", "dist/grpc-server.js"]
