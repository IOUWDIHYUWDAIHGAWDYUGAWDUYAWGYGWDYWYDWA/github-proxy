FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server.mjs ./
COPY src ./src
COPY public ./public
USER node
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
