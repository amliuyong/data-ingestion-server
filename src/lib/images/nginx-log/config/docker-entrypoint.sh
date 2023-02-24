#!/bin/sh
# vim:sw=4:ts=4:et

set -e

if [ -z "${NGINX_ENTRYPOINT_QUIET_LOGS:-}" ]; then
    exec 3>&1
else
    exec 3>/dev/null
fi

if [ "$1" = "nginx" -o "$1" = "nginx-debug" ]; then
    if /usr/bin/find "/docker-entrypoint.d/" -mindepth 1 -maxdepth 1 -type f -print -quit 2>/dev/null | read v; then
        echo >&3 "$0: /docker-entrypoint.d/ is not empty, will attempt to perform configuration"

        echo >&3 "$0: Looking for shell scripts in /docker-entrypoint.d/"
        find "/docker-entrypoint.d/" -follow -type f -print | sort -V | while read -r f; do
            case "$f" in
                *.sh)
                    if [ -x "$f" ]; then
                        echo >&3 "$0: Launching $f";
                        "$f"
                    else
                        # warn on shell scripts without exec bit
                        echo >&3 "$0: Ignoring $f, not executable";
                    fi
                    ;;
                *) echo >&3 "$0: Ignoring $f";;
            esac
        done

        echo >&3 "$0: Configuration complete; ready for start up"
    else
        echo >&3 "$0: No files found in /docker-entrypoint.d/, skipping configuration"
    fi
fi

aws --version

curl --silent ${ECS_CONTAINER_METADATA_URI_V4}/task --output /tmp/task

TASK_ID=$(cat /tmp/task | grep -o -E  -e "TaskARN[^,]+:task/[^,\"]+"  | grep -o -E -e "arn:aws:ecs.*" | cut -d / -f3)

echo "TASK_ID: $TASK_ID"
echo "SERVER_ENDPOINT_PATH: $SERVER_ENDPOINT_PATH"
echo "WORKER_CONNECTIONS: $WORKER_CONNECTIONS"
sed -i "s#%%SERVER_ENDPOINT_PATH%%#$SERVER_ENDPOINT_PATH#g; s#%%TASK_ID%%#$TASK_ID#g; s#%%WORKER_CONNECTIONS%%#$WORKER_CONNECTIONS#g" /etc/nginx/nginx.conf

sed -i "s#%%TASK_ID%%#$TASK_ID#g;" /etc/logrotate.d/nginx
sed -i "s#%%AWS_S3_BUCKET%%#$AWS_S3_BUCKET#g; s#%%AWS_S3_PREFIX%%#$AWS_S3_PREFIX#g; s#%%USE_EFS%%#$USE_EFS#g;" /tools/copy_file_to_s3.sh

mkdir -p /var/log/nginx/todo || true 

/usr/bin/env > /etc/cron.d/crond.conf
echo "#"  >> /etc/cron.d/crond.conf
cat /etc/cron.d/nginx-logrotate-crond.conf >> /etc/cron.d/crond.conf

crontab /etc/cron.d/crond.conf

/usr/sbin/cron
 
exec "$@"
