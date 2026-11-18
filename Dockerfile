# Imagen liviana con versión fija (nunca :latest)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# 1) Solo los manifiestos: esta capa se reutiliza mientras no cambien las
#    dependencias, así un cambio en el código no repite "npm ci".
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2) Después el código (cambia seguido, por eso va al final)
COPY --chown=node:node . .

# El proceso NO corre como root
USER node

EXPOSE 3000
CMD ["node", "app.js"]
