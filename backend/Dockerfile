FROM node:22-alpine

WORKDIR /src

RUN apk add --no-cache bash

COPY package*.json ./
RUN npm install

STOPSIGNAL SIGKILL

COPY . .
RUN chmod +x ./start.sh

ENTRYPOINT [ "./start.sh" ]
