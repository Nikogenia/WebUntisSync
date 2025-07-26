FROM node:22-bookworm

WORKDIR /src

COPY package*.json ./
RUN npm install

STOPSIGNAL SIGKILL

COPY . .

ENTRYPOINT [ "./start.sh" ]
