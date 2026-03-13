FROM ghcr.io/puppeteer/puppeteer:21.0.0

WORKDIR /home/pptruser/app

COPY package*.json ./
RUN npm ci

COPY . .

# Cloud platforms use the PORT env variable
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start:auto"]
