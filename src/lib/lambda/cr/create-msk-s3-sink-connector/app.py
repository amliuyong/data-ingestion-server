# https://github.com/dpkp/kafka-python/blob/master/kafka/admin/client.py

import boto3
import os
import time
import logging
import wget
import json
from botocore.exceptions import ClientError

client = boto3.client("kafkaconnect")
s3 = boto3.client('s3')

log = logging.getLogger()
log.setLevel('INFO')
aws_region = os.environ['AWS_REGION']

plugin_s3_bucket = os.environ['MSK_PLUGIN_S3_BUCKET']
sink_s3_bucket = os.environ['MSK_SINK_S3_BUCKET']
sink_s3_obj_prefix = os.environ['MSK_SINK_S3_PREFIX']
msk_topic = os.environ['MSK_TOPIC']

#msk_topic_debug = f"{msk_topic}-debug"

msk_brokers = os.environ['MSK_BROKERS']
msk_cluster_name = os.environ['MSK_CLUSTER_NAME']

s3_connector_role_arn = os.environ['MSK_CONNECTOR_ROLE_ARN']

msk_security_group_id = os.environ['MSK_SECURITY_GROUP_ID']
msk_subnet_ids = os.environ['MSK_SUBNET_IDS']

maxWorkerCount = int(os.environ.get('MSK_S3_CONNECTOR_WORKER_COUNT_MAX', '4'))
minWorkerCount = int(os.environ.get('MSK_S3_CONNECTOR_WORKER_COUNT_MIN', '1'))
mcuCount = int(os.environ.get('MSK_S3_CONNECTOR_MCU_COUNT', '1'))
log_s3_bucket = os.environ.get('MSK_CONNECTOR_LOG_S3_BUCKET', sink_s3_bucket)

timestamp = str(int(time.time()))
aws_partition='aws'

connect_plugin_url = os.environ.get('CLOUDFRONT_KAFKA_CONNECT_S3_PLUGIN_ZIP_URL', 
'https://d1i4a15mxbxib1.cloudfront.net/api/plugins/confluentinc/kafka-connect-s3/versions/10.2.2/confluentinc-kafka-connect-s3-10.2.2.zip')

def string_to_s3(content, bucket, key):
    s3.put_object(
        Body=content.encode("utf-8"),
        Bucket=bucket,
        Key=key
    )


def read_as_json(bucket, key):
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(obj['Body'].read())
    except:
        return None


def delete_obj(bucket, key):
    try:
        s3.delete_object(Bucket=bucket, Key=key)
    except:
        pass


def handler(event, context):

    log.info(f"plugin_s3_bucket: {plugin_s3_bucket}")
    log.info(f"sink_s3_bucket: {sink_s3_bucket}")
    log.info(f"sink_s3_obj_prefix: {sink_s3_obj_prefix}")
    log.info(f"msk_topic: {msk_topic}")
    log.info(f"msk_brokers: {msk_brokers}")
    log.info(f"msk_cluster_name: {msk_cluster_name}")
    log.info(f"s3_connector_role_arn: {s3_connector_role_arn}")
    log.info(f"log_s3_bucket: {log_s3_bucket}")
    log.info(f"msk_security_group_id: {msk_security_group_id}")
    log.info(f"msk_subnet_ids: {msk_subnet_ids}")
    log.info(f"maxWorkerCount: {maxWorkerCount}")
    log.info(f"minWorkerCount: {minWorkerCount}")
    
    invoked_function_arn = context.invoked_function_arn
    global aws_partition
    aws_partition = invoked_function_arn.split(":")[1]

    RequestType = event.get('RequestType')
    log.info("RequestType:" + RequestType)
    stack_arn = event.get('StackId', '')
    unique_stack_id = stack_arn.split('/')[2].split('-')[4]

    connector_name = f"{msk_cluster_name}{unique_stack_id}-s3-sink-connector"
    plugin_name = f"{msk_cluster_name}{unique_stack_id}-connector-s3-plugin"

    log.info(f"connector_name:{connector_name}")
    log.info(f"plugin_name:{plugin_name}")

    list_res = client.list_connectors(
        connectorNamePrefix=connector_name,
        maxResults=10,
    )
    conn_size = len(list_res['connectors'])
    log.info("find {} connectors, connector_name: {}".format(
        conn_size, connector_name))

    if RequestType == 'Create':
        if conn_size == 0:
            return create_new_connector(connector_name, plugin_name)
        else:
            log.info(f"connector: {connector_name} already exists")
            existing_connector = list_res['connectors'][0]
            connectorState = existing_connector['connectorState']
            log.info(f"connectorState: {connectorState}")
            if connectorState in ['DELETING', 'FAILED']:
                delete_connector(existing_connector)
                return create_new_connector(connector_name, plugin_name)
            return

    if (RequestType == 'Delete'):
        [delete_connector(connector_info)
         for connector_info in list_res['connectors']]
        delete_plugins(plugin_name)

    if (RequestType == 'Update'):
        [update_connector(connector_info)
         for connector_info in list_res['connectors']]


def create_new_connector(connector_name, plugin_name):
    log.info("create_new_connector: " + connector_name)
    # create new
    plugin_arn = create_s3_sink_plugin(plugin_name)
    connector_arn = create_s3_connector(plugin_arn, connector_name)
    connector_config_info = {
        "plugin_arn": plugin_arn,
        "connector_arn": connector_arn,
    }
    return connector_config_info


def update_connector(connector_info):
    log.info("update_connector")
    connector_arn = connector_info['connectorArn']
    update_s3_connector(connector_arn)


def delete_connector(connector_info):
    log.info("delete_connector")

    connectorState = connector_info['connectorState']
    log.info(f"delete_connector  connectorState {connectorState}")
    connector_arn = connector_info['connectorArn']

    if connectorState != 'DELETING':
        del_res = client.delete_connector(
            connectorArn=connector_arn,
        )
        connectorState = del_res['connectorState']
        log.info(f"connectorState:{connectorState}")

    while True:
        time.sleep(10)
        try:
            descr_res = client.describe_connector(
                connectorArn=connector_arn
            )
            connectorState = descr_res['connectorState']
            log.info(f"connectorState:{connectorState}")
        except client.exceptions.NotFoundException:
            log.info(f"{connector_arn} deleted")
            break


def delete_plugins(plugin_name):
    list_plugin_res = client.list_custom_plugins(
        maxResults=10,
    )
    custom_plugins = [custom_plugin for custom_plugin in list_plugin_res['customPlugins'] if str(
        custom_plugin['name']) == plugin_name]
    log.info("find plugin_name: {} , count: {}".format(
        plugin_name, len(custom_plugins)))
    [delete_plugin(custom_plugin) for custom_plugin in custom_plugins]


def delete_plugin(custom_plugin):
    plugin_arn = custom_plugin['customPluginArn']
    log.info(f"delete {plugin_arn}")
    # get error here 'KafkaConnect' object has no attribute 'delete_custom_plugin', bug of boto3?
    # https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/kafkaconnect.html#KafkaConnect.Client.delete_custom_plugin

    try:
        client.delete_custom_plugin(
            customPluginArn=plugin_arn
        )
        time.sleep(10)
    except Exception as e:
        log.error(repr(e))

    descr_res = client.describe_custom_plugin(
        customPluginArn=plugin_arn
    )
    customPluginState = descr_res['customPluginState']
    log.info(f"customPluginState:{customPluginState}")


def download_plugin_to_s3():
    file_name = os.path.basename(connect_plugin_url)
    download_file = "/tmp/" + file_name
    log.info("download " + connect_plugin_url)
    wget.download(connect_plugin_url, out=download_file)
    s3_key = "msk-plugin/{}/".format(timestamp) + file_name

    try:
        s3.upload_file(download_file, plugin_s3_bucket, s3_key, ExtraArgs={
            'ContentType': 'application/zip'
        })
    except ClientError as e:
        logging.error(e)
        raise e
    finally:
        os.remove(download_file)
    log.info("download_plugin_to_s3 done, s3_key=" + s3_key)
    return s3_key


def create_s3_sink_plugin(plugin_name):
    list_plugin_res = client.list_custom_plugins(
        maxResults=10,
    )
    log.info("find {} custom_plugins".format(
        len(list_plugin_res['customPlugins'])))
    my_custom_plugins = [custom_plugin for custom_plugin in list_plugin_res['customPlugins']
                         if custom_plugin['name'] == plugin_name]

    if len(my_custom_plugins) > 0:
        log.info(
            f"{plugin_name} already exists, state: {my_custom_plugins[0]['customPluginState']}")
        customPluginState = my_custom_plugins[0]['customPluginState']
        if customPluginState != 'ACTIVE':
            raise Exception(
                f"{plugin_name} already exists, State: {customPluginState}")
        return my_custom_plugins[0]['customPluginArn']

    plugin_s3_key = download_plugin_to_s3()
    plugin_bucket_arn = "arn:{}:s3:::{}".format(aws_partition, plugin_s3_bucket)
    plugin_response = client.create_custom_plugin(
        contentType="ZIP",
        description=f"s3://{plugin_s3_bucket}/{plugin_s3_key}",
        location={
            "s3Location": {
                "bucketArn": plugin_bucket_arn,
                "fileKey": plugin_s3_key
            }
        },
        name=plugin_name,
    )
    plugin_arn = plugin_response["customPluginArn"]

    while plugin_response["customPluginState"] != "ACTIVE":
        log.info("customPluginState: {}".format(
            plugin_response["customPluginState"]))
        time.sleep(10)
        plugin_response = client.describe_custom_plugin(
            customPluginArn=plugin_arn)
        if plugin_response["customPluginState"] == "CREATE_FAILED":
            log.error("Plugin failed to activate")
            raise Exception("Plugin failed to activate")

    log.info("Plugin created successfully, plugin_arn:" + plugin_arn)
    return plugin_arn


def create_s3_connector(plugin_arn, connector_name):
    log.info("create_s3_connector() plugin_arn:" +
             plugin_arn + ", connector_name:" + connector_name)
    connector_response = client.create_connector(
        connectorName=connector_name,
        plugins=[
            {
                'customPlugin': {
                    'customPluginArn': plugin_arn,
                    'revision': 1
                }
            },
        ],
        capacity={
            'autoScaling': {
                'maxWorkerCount': maxWorkerCount,
                'mcuCount': 1,
                'minWorkerCount': minWorkerCount,
                'scaleInPolicy': {
                    'cpuUtilizationPercentage': 20
                },
                'scaleOutPolicy': {
                    'cpuUtilizationPercentage': 80
                }
            }
        },
        connectorConfiguration=getConnectorConfiguration(),
        kafkaCluster={
            'apacheKafkaCluster': {
                'bootstrapServers': msk_brokers,
                'vpc': {
                    'securityGroups': [
                        msk_security_group_id,
                    ],
                    'subnets': msk_subnet_ids.split(',')
                }
            }
        },
        kafkaClusterClientAuthentication={
            'authenticationType': 'NONE'
        },
        kafkaClusterEncryptionInTransit={
            'encryptionType': 'PLAINTEXT'
        },
        kafkaConnectVersion='2.7.1',
        logDelivery={
            'workerLogDelivery': {
                's3': {
                    'bucket': log_s3_bucket,
                    'enabled': True,
                    'prefix': 'msk-s3-connector-logs'
                }
            }
        },
        serviceExecutionRoleArn=s3_connector_role_arn,
    )

    connectorArn = connector_response['connectorArn']
    log.info(f"connectorArn={connectorArn}")
    # 'connectorState': 'RUNNING'|'CREATING'|'UPDATING'|'DELETING'|'FAILED',
    n = 0
    while True:
        time.sleep(20)
        response = client.describe_connector(connectorArn=connectorArn)
        connectorState = response['connectorState']
        log.info(f"connectorState: {connectorState},  n={n}")

        if connectorState == 'RUNNING':
            log.info("Connector created successfully and is running")
            break
        if connectorState == 'FAILED':
            raise Exception('connectorState FAILED')
        # wait at most 10 mins, if not failed.
        if n > 30:
            log.info("wait too long, break")
            break
        n = n + 1

    return connectorArn


def update_s3_connector(connector_arn):
    '''
    maxWorkerCount and minWorkerCount can be updated

    '''

    log.info(f"update_s3_connector: {connector_arn}")
    res = client.describe_connector(
        connectorArn=connector_arn
    )
    connectorState = res['connectorState']
    currentVersion = res['currentVersion']
    log.info(
        f"connectorState: {connectorState}, currentVersion: {currentVersion}")

    update_res = client.update_connector(
        capacity={
            'autoScaling': {
                'maxWorkerCount': maxWorkerCount,
                'mcuCount': mcuCount,
                'minWorkerCount': minWorkerCount,
                'scaleInPolicy': {
                    'cpuUtilizationPercentage': 20
                },
                'scaleOutPolicy': {
                    'cpuUtilizationPercentage': 80
                }
            }
        },
        connectorArn=connector_arn,
        currentVersion=currentVersion
    )

def getConnectorConfiguration():
    # https://docs.confluent.io/kafka-connectors/s3-sink/current/overview.html#amazon-s3-sink-connector-for-cp
    # https://docs.confluent.io/kafka-connectors/s3-sink/current/configuration_options.html#connector
    configuration =  {
        "connector.class": "io.confluent.connect.s3.S3SinkConnector",
        "tasks.max": "2",
        "topics": f"{msk_topic}",
        "s3.region": aws_region,
        "s3.bucket.name": sink_s3_bucket,
        "topics.dir": sink_s3_obj_prefix,
        "flush.size": "10000",
        "rotate.interval.ms": "30000",
        "s3.compression.type": "gzip",
        "storage.class": "io.confluent.connect.s3.storage.S3Storage",
        "format.class": "io.confluent.connect.s3.format.json.JsonFormat",
        "partitioner.class": "io.confluent.connect.storage.partitioner.TimeBasedPartitioner",
        "path.format": "'year'=YYYY/'month'=MM/'day'=dd/'hour'=HH",
        "partition.duration.ms": "60000",
        "timezone": "UTC",
        "locale": "en-US",
        "key.converter": "org.apache.kafka.connect.storage.StringConverter",
        "value.converter" : "org.apache.kafka.connect.json.JsonConverter",
        "value.converter.schemas.enable": "false",
        "schema.compatibility": "NONE",
        "errors.log.enable": "true",
    }
    log.info(f"ConnectorConfiguration:{configuration}")
    return configuration