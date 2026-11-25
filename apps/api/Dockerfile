# Build from the monorepo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /workspace
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install
COPY . .
RUN npm run build:api

FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
