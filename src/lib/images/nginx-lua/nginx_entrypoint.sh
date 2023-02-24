#!/bin/sh
# vim:sw=4:ts=4:et

mkdir -p /var/log/nginx/ || true

wget -q ${ECS_CONTAINER_METADATA_URI_V4}/task -O /tmp/task
TASK_ID=$(cat /tmp/task | grep -o -E  -e "TaskARN[^,]+:task/[^,\"]+"  | grep -o -E -e "arn:aws:ecs.*" | cut -d / -f3)
echo "TASK_ID: $TASK_ID"

sed -i "s#%%TASK_ID%%#$TASK_ID#g"  /opt/openresty/nginx/conf/conf.d/common.conf
echo "AWS_MSK_BROKERS: $AWS_MSK_BROKERS"

AWS_MSK_BROKER_1=$(echo $AWS_MSK_BROKERS | cut -d ',' -f1 | cut -d ':' -f 1)
AWS_MSK_BROKER_2=$(echo $AWS_MSK_BROKERS | cut -d ',' -f2 | cut -d ':' -f 1)
AWS_MSK_BROKER_3=$(echo $AWS_MSK_BROKERS | cut -d ',' -f3 | cut -d ':' -f 1)

echo "AWS_MSK_BROKER_1: $AWS_MSK_BROKER_1"
echo "AWS_MSK_BROKER_2: $AWS_MSK_BROKER_2"
echo "AWS_MSK_BROKER_3: $AWS_MSK_BROKER_3"
echo "AWS_MSK_TOPIC: $AWS_MSK_TOPIC"

sed -i "s#%%AWS_MSK_TOPIC%%#$AWS_MSK_TOPIC#g; s#%%AWS_MSK_BROKER_1%%#$AWS_MSK_BROKER_1#g; s#%%AWS_MSK_BROKER_2%%#$AWS_MSK_BROKER_2#g; s#%%AWS_MSK_BROKER_3%%#$AWS_MSK_BROKER_3#g" /opt/openresty/nginx/lua/send_to_kafka.lua

cat /opt/openresty/nginx/lua/send_to_kafka.lua

/opt/openresty/nginx/sbin/nginx -c /opt/openresty/nginx/conf/nginx.conf
