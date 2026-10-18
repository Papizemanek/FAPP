# Server F*app (API, hlídač check-inů, stránka pro důvěryhodnou osobu).
# Databáze SQLite leží v /data – na hostingu tam připoj trvalý disk (volume), jinak se po restartu smaže.
FROM node:22-slim
WORKDIR /srv
ENV DB_FILE=/data/fapp.db PORT=3000
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY app/package.json app/
RUN npm ci --omit=dev -w server -w shared --include-workspace-root=false --ignore-scripts && npm cache clean --force
COPY shared shared
COPY server server
RUN mkdir -p /data
EXPOSE 3000
WORKDIR /srv/server
CMD ["sh", "-c", "node --disable-warning=ExperimentalWarning src/index.js"]
