FROM node:22-alpine
WORKDIR /app
COPY ./mentorlm/package*.json ./
RUN npm ci
COPY ./mentorlm/ ./
EXPOSE 3000
CMD ["npm", "run", "dev"]