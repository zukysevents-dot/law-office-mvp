# Tiny cron sidecar: replaces the two Vercel cron jobs by curl-ing the app's
# internal endpoints on a schedule. BusyBox crond passes its environment to
# jobs, so $CRON_SECRET (from env_file) is available inside run.sh.
FROM alpine:3.20

RUN apk add --no-cache curl tzdata
ENV TZ=Europe/Prague

COPY crontab /etc/crontabs/root
COPY run.sh /usr/local/bin/run.sh
RUN chmod +x /usr/local/bin/run.sh

# -f foreground, -l 8 log level to stdout (visible via `docker compose logs cron`)
CMD ["crond", "-f", "-l", "8"]
