FROM public.ecr.aws/docker/library/node:18.17.0-alpine AS builder

# install dependecies
RUN apk update
RUN apk add --no-cache git build-base gcc abuild make bash

# Add Tini
RUN apk add --no-cache tini

RUN mkdir -p /home/node/app && chown root:root /home/node/app

USER root

WORKDIR /home/node/app

# set our node environment, either development or production
# defaults to production, compose overrides this to development on build and run
ARG NODE_ENV=development
ENV NODE_ENV $NODE_ENV

# set DEBIAN_FRONTEND to noninteractive.
ENV DEBIAN_FRONTEND noninteractive

# default to port 80 for node, and 9229 and 9230 (tests) for debug
ARG PORT=80
ENV PORT $PORT
EXPOSE $PORT 9229 9230

# install dependencies first, in a different location for easier app bind mounting for local development

COPY --chown=node:node ./package*.json ./

RUN npm install

RUN chown node:node ./node_modules

# copy in our source code last, as it changes the most
COPY . .

RUN make build

ENTRYPOINT ["/sbin/tini", "--"]

FROM public.ecr.aws/docker/library/node:18.17.0-alpine AS production

RUN apk update
RUN apk add --no-cache make

# Add Tini
RUN apk add --no-cache tini

RUN mkdir -p /home/node/app && chown root:root /home/node/app

USER root

WORKDIR /home/node/app

# set our node environment, either development or production
# defaults to production, compose overrides this to development on build and run
ARG NODE_ENV=production
ENV NODE_ENV $NODE_ENV

COPY --from=builder /home/node/app/package*.json ./
COPY --from=builder /home/node/app/node_modules ./node_modules/
COPY --from=builder /home/node/app/dist ./dist
COPY --from=builder /home/node/app/Makefile ./
COPY --from=builder /home/node/app/.sequelizerc ./

RUN mv ./.sequelizerc ./.sequelizerc

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["npm", "run", "start"]
