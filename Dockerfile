# Stage 1: Compile TypeScript into dist
FROM node:26-alpine AS build
WORKDIR /app

# Disable Husky because .git is excluded from the build context
ENV HUSKY=0
COPY package.json package-lock.json ./

# Install the exact dependency versions recorded in package-lock.json
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Create the production runtime image
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./

# Install production dependencies only and skip lifecycle scripts such as Husky
RUN npm ci --omit=dev --ignore-scripts

# Copy the compiled application and migrations required at startup
COPY --from=build /app/dist ./dist
COPY src/db/migrations ./src/db/migrations

# Document the application's default port
EXPOSE 8080

# Run as the non-root user included in the Node image
USER node
CMD ["node", "dist/index.js"]
