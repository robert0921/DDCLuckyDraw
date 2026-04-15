# build stage
FROM node:22-bullseye AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm i -g pnpm@10.26.1
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# production stage
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
