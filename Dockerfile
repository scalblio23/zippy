FROM node:22-slim

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN npm install -g pnpm@10.4.1 && pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

EXPOSE 8080
CMD ["pnpm", "run", "start"]
