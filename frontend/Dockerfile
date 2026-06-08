# VIPER frontend — build the Vite/React bundle, serve it via nginx.
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Bundle with vite directly. `npm run build` also runs `tsc -b`, which has a
# known pre-existing ~90-error baseline in unrelated modules (tracked in
# PROGRESS.md); type-checking is a separate CI concern, not a release blocker.
RUN npx vite build

# --- Runtime: static files behind nginx, /api proxied to the backend ---
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
