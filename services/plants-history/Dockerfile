FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src

ENV NODE_PORT=13338 \
    DB_PATH=/data/plants_history.db

EXPOSE 13338

CMD ["node", "src/server.js"]
