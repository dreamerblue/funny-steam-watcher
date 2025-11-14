FROM node:18

WORKDIR /app/

COPY README.md ./
COPY package.json ./
COPY package-lock.json ./
COPY *.js ./
RUN npm install --production
CMD npm start
