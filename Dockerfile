# Stage 1: Compile TypeScript into dist
FROM node:26-alpine AS build
WORKDIR /app

# Husky requires .git
# .git is ignored in .dockerignore
# So, we turn Husky off
ENV HUSKY=0
COPY package.json package-lock.json ./

# We used this instead of npm install
# Because npm install may updates the packages
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: The image we actually run
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./

# In package.json we have devDependencies
# We don't need them when the server runs
# --omit=dev do that for us

# Although NODE_ENV is production
# We did add --omit=dev just for extra safety

# In package.json we have scripts that run automatically
# Like "prepare": "husky"
# --ignore-scripts ignores them for us
RUN npm ci --omit=dev --ignore-scripts

# Bring dist from stage 1
COPY --from=build /app/dist ./dist
COPY src/db/migrations ./src/db/migrations

# Good for documentation
EXPOSE 8080

# The node image already has a user called "node"
# Running as root inside the container is not needed here
USER node
CMD ["node", "dist/index.js"]
