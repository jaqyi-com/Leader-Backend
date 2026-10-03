# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY .env* ./

# Expose API port
EXPOSE 3001

# Set Node environment to production
ENV NODE_ENV=production
ENV PORT=3001

# Command to start server
CMD ["node", "src/server.js"]
