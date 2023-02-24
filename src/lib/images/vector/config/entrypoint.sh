#!/bin/sh
# vim:sw=4:ts=4:et

export RUST_BACKTRACE=full

#TLS
export AWS_MSK_AUTH_TLS_ENABLE=false

#SASL -- NOT Work
export AWS_MSK_AUTH_SASL_ENABLE=false
export SASL_USER_NAME=msk
export SASL_PASSWORD=awsMsk123!

toml_files="/etc/vector/vector-global.toml /etc/vector/vector.toml"

wget -q ${ECS_CONTAINER_METADATA_URI_V4}/task -O /tmp/task

TASK_ID=$(cat /tmp/task | grep -o -E  -e "TaskARN[^,]+:task/[^,\"]+"  | grep -o -E -e "arn:aws:ecs.*" | cut -d / -f3)

echo "TASK_ID: $TASK_ID"

mkdir -p /var/lib/vector/$TASK_ID || true

sed -i "s#%%TASK_ID%%#$TASK_ID#g"  /etc/vector/vector-global.toml

echo "AWS_REGION: $AWS_REGION"
echo "AWS_S3_BUCKET: $AWS_S3_BUCKET"
echo "AWS_S3_PREFIX: $AWS_S3_PREFIX"
echo "AWS_MSK_BROKERS: $AWS_MSK_BROKERS"
echo "AWS_MSK_TOPIC: $AWS_MSK_TOPIC"
echo "AWS_KINESIS_STREAM_NAME: $AWS_KINESIS_STREAM_NAME"
echo "STREAM_ACK_ENABLE: $STREAM_ACK_ENABLE"
echo "VECTOR_REQUIRE_HEALTHY: $VECTOR_REQUIRE_HEALTHY"
echo "VECTOR_THREADS_NUM: $VECTOR_THREADS_NUM"
echo "AWS_MSK_AUTH_TLS_ENABLE: $AWS_MSK_AUTH_TLS_ENABLE"
echo "AWS_MSK_AUTH_SASL_ENABLE: $AWS_MSK_AUTH_SASL_ENABLE"

VECTOR_THREADS_OPT="--threads ${VECTOR_THREADS_NUM}"

if [ $VECTOR_THREADS_NUM == '-1' ];
then
   VECTOR_THREADS_OPT=""
fi 

batch_or_ack="batch"
if [ $STREAM_ACK_ENABLE == 'true' ];
then 
   batch_or_ack="ack"
fi

tls=""
if [ $AWS_MSK_AUTH_TLS_ENABLE == 'true' ];
then 
   tls="-tls"
fi

sasl=""
if [ $AWS_MSK_AUTH_SASL_ENABLE == 'true' ];
then 
   sasl="-sasl"
fi

if [ "$tls" != "" -a "$sasl" != "" ];
then 
   echo "Config error: AWS_MSK_AUTH_TLS_ENABLE=$AWS_MSK_AUTH_TLS_ENABLE, AWS_MSK_AUTH_SASL_ENABLE=$AWS_MSK_AUTH_SASL_ENABLE "
   exit 1;
fi

msk_config_file=/etc/vector/vector-msk-${batch_or_ack}${tls}${sasl}.toml
kinesis_config_file=/etc/vector/vector-kinesis-${batch_or_ack}.toml
s3_config_file=/etc/vector/vector-s3.toml

if [ $AWS_S3_BUCKET != '__NOT_SET__' ] && [ -f ${s3_config_file} ];
then
   sed -i "s#%%AWS_REGION%%#$AWS_REGION#g; s#%%AWS_S3_BUCKET%%#$AWS_S3_BUCKET#g; s#%%AWS_S3_PREFIX%%#$AWS_S3_PREFIX#g;" ${s3_config_file}
   toml_files="${toml_files} ${s3_config_file}"
fi 

if [ $AWS_MSK_BROKERS != '__NOT_SET__' ] && [ -f ${msk_config_file} ];
then
   sed -i "s#%%AWS_REGION%%#$AWS_REGION#g; s#%%AWS_MSK_BROKERS%%#$AWS_MSK_BROKERS#g; s#%%AWS_MSK_TOPIC%%#$AWS_MSK_TOPIC#g;" ${msk_config_file}
   toml_files="${toml_files} ${msk_config_file}"
fi 

if [ $AWS_KINESIS_STREAM_NAME != '__NOT_SET__' ] && [ -f ${kinesis_config_file} ];
then
   sed -i "s#%%AWS_REGION%%#$AWS_REGION#g; s#%%STREAM_ACK_ENABLE%%#$STREAM_ACK_ENABLE#g; s#%%AWS_KINESIS_STREAM_NAME%%#$AWS_KINESIS_STREAM_NAME#g;" ${kinesis_config_file}
   toml_files="${toml_files} ${kinesis_config_file}"
fi 

echo "/usr/local/bin/vector validate ${toml_files}"
/usr/local/bin/vector validate ${toml_files}

configs=$(echo $toml_files | sed "s#/etc/#--config /etc/#g")

echo "/usr/local/bin/vector ${configs} --require-healthy $VECTOR_REQUIRE_HEALTHY $VECTOR_THREADS_OPT"
/usr/local/bin/vector ${configs} --require-healthy $VECTOR_REQUIRE_HEALTHY $VECTOR_THREADS_OPT

