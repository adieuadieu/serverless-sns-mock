FROM allthings/node

COPY . /srv/www
WORKDIR /srv/www

ENV NODE_ENV production

USER root

RUN rm -rf node_modules yarn.lock \
  && rm -rf "$(yarn cache dir)" \
  && yarn install --production=false --frozen-lockfile \
  && chown -R node:node /srv/www

USER node

# Fix to allow running the container in read-only mode:
RUN mkdir -p /home/node/.aws \
  && touch /home/node/.aws/credentials \
  && echo "{}" > /home/node/.serverlessrc

ENV PATH "$PATH:/srv/www/node_modules/.bin"

ENV PORT 3030

ENTRYPOINT ["tini", "-g", "--", "node", "/srv/www/src/server.js"]

EXPOSE 3030
