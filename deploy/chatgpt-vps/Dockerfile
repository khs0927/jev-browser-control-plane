FROM node:22.19.0-bookworm-slim AS frontend
WORKDIR /src/web
COPY vendor/chatcmd/web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY vendor/chatcmd/web/ ./
RUN npm run build

FROM rust:1.90.0-bookworm AS backend
WORKDIR /src
COPY vendor/chatcmd/ ./
COPY --from=frontend /src/web/dist ./web/dist
RUN cargo build --locked --release --features embedded-web

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates chromium chromium-sandbox xvfb x11vnc novnc websockify \
    supervisor fluxbox curl git python3 fonts-noto-cjk fonts-liberation tini gosu \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 runner
COPY --from=backend /src/target/release/chat-cmd-client /usr/local/bin/chatcmd
COPY vendor/chatcmd/chatgpt-extension/ /opt/chatcmd-extension/
COPY supervisord.conf /etc/supervisor/conf.d/runtime.conf
COPY entrypoint.sh browser.sh /usr/local/bin/
COPY runtime_health.py /usr/local/bin/runtime_health.py
RUN chmod 755 /usr/local/bin/entrypoint.sh /usr/local/bin/browser.sh
WORKDIR /home/runner
ENV HOME=/home/runner DISPLAY=:99 CHATCMD_BIND=127.0.0.1 CHATCMD_PORT=8080 \
    CHATCMD_DB_PATH=/home/runner/state/chatcmd.db \
    CHATCMD_LOG_PATH=/home/runner/state/logs/chatcmd.log
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
