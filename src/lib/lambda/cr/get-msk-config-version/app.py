import boto3
import os
import logging
import time

kafka = boto3.client('kafka')

log = logging.getLogger()
log.setLevel('INFO')
aws_region = os.environ['AWS_REGION']

msk_config_arn = os.environ['MSK_CONFIG_ARN']


def handler(event, context):
    log.info("msk_config_arn:" + msk_config_arn)
    RequestType = event.get('RequestType')
    log.info("RequestType:" + RequestType)
    if RequestType != 'Delete':
        time.sleep(5) # add sleep here to wait the config ready.
        response = kafka.describe_configuration(
            Arn=msk_config_arn
        )
        res = {"Data": {"version":  response['LatestRevision']['Revision']}}
        log.info("return {}".format(res))
        return res
    return None
