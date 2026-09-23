ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache nodejs npm

WORKDIR /app
# npm ci et le verrou : la version exacte de mqtt est figee, une future
# version piegee ne peut pas arriver toute seule dans l image.
COPY package.json package-lock.json /app/
RUN npm ci --omit=dev && npm cache clean --force

COPY hub.js wled-animations.js categories.json retirees.txt lametric.js /app/
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
