FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG BUILD_ENV=production
ENV VITE_API_URL=${VITE_API_URL}
RUN test -n "$VITE_API_URL" \
    && case "$BUILD_ENV:$VITE_API_URL" in \
        production:https://*) true ;; \
        development:https://*|development:http://*) true ;; \
        *) false ;; \
    esac \
    && if [ "$BUILD_ENV" = "development" ]; then npm run build -- --mode development; else npm run build; fi

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
