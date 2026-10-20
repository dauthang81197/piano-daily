FROM node:22-bookworm-slim AS node

# The Audiveris .deb is built for Ubuntu 22.04, so run on that and borrow Node from the official image.
FROM ubuntu:22.04
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm

# Audiveris .deb (ubuntu22.04 build, bundles Java) from https://github.com/Audiveris/audiveris/releases
# Pass the full URL: --build-arg AUDIVERIS_DEB_URL=https://.../Audiveris-x.y.z-ubuntu22.04-x86_64.deb
# The package is unpacked rather than installed: its post-install script wants a desktop, a server has none.
ARG AUDIVERIS_DEB_URL
RUN test -n "$AUDIVERIS_DEB_URL" || (echo "AUDIVERIS_DEB_URL build arg is required" && exit 1)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl fontconfig tesseract-ocr tesseract-ocr-eng \
      libasound2 libbsd0 libx11-6 libxext6 libxi6 libxrender1 libxtst6 zlib1g libgtk-3-0 \
 && curl -fsSL -o /tmp/audiveris.deb "$AUDIVERIS_DEB_URL" \
 && dpkg-deb -x /tmp/audiveris.deb / \
 && rm -rf /tmp/audiveris.deb /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# Electron is only for the desktop app; the API does not need it.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN node /usr/local/lib/node_modules/npm/bin/npm-cli.js ci --omit=dev
COPY src ./src

ENV AUDIVERIS=/opt/audiveris/bin/Audiveris \
    JAVA_TOOL_OPTIONS=-Djava.awt.headless=true \
    PORT=3000
RUN useradd -m app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server.ts"]
