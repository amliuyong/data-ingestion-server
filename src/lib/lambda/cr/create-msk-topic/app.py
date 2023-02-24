import os
import time
import logging
from kafka import KafkaAdminClient
from kafka.admin import NewTopic
from kafka.errors import TopicAlreadyExistsError

log = logging.getLogger()
log.setLevel('INFO')
aws_region = os.environ['AWS_REGION']
timestamp = str(int(time.time()))

msk_topic = os.environ['MSK_TOPIC']
msk_brokers = os.environ['MSK_BROKERS']

replication_factor = len(msk_brokers.split(","))
msk_topic_partitions = os.environ.get('MSK_TOPIC_PARTITIONS', 10)
msk_topic_replication_factor = os.environ.get(
    'MSK_TOPIC_REPLICATION_FACTOR', min(replication_factor, 3))


def handler(event, context):
    RequestType = event.get('RequestType')
    log.info(f"RequestType={RequestType}")
    log.info(f"msk_topic={msk_topic}")
    log.info(f"msk_brokers={msk_brokers}")
    log.info(f"replication_factor={replication_factor}")
    log.info(f"msk_topic_partitions={msk_topic_partitions}")
    log.info(f"msk_topic_replication_factor={msk_topic_replication_factor}")

    if RequestType == 'Create':
        create_msk_topic()
    else:
        log.info(f"Do nothing RequestType: {RequestType}")

    return {"Data": {"topics": [msk_topic]}}


def create_msk_topic():
    admin_client = KafkaAdminClient(bootstrap_servers=msk_brokers)
    try:
        res = admin_client.create_topics(
            new_topics=[
                NewTopic(
                    name=msk_topic,
                    num_partitions=int(msk_topic_partitions),
                    replication_factor=int(msk_topic_replication_factor)),
            ])
        log.info(f"created topics: {msk_topic}")
        log.info(res)
    except TopicAlreadyExistsError as e:
        log.info("topic already exists.")
        log.warning(repr(e))
        return
