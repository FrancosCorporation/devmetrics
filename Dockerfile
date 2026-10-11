FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
RUN chown -R node:node /app
COPY --chown=node:node . .
USER node
EXPOSE 3600
CMD ["node", "server.js"]
