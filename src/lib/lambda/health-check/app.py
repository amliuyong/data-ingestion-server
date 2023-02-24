import os
import logging
from urllib.request import urlopen
import time
import boto3

log = logging.getLogger()
log.setLevel('INFO')
aws_region = os.environ['AWS_REGION']
topic_arn = os.environ['SNS_TOPIC_ARN']
sns = boto3.client('sns', region_name=aws_region)

def handler(event, context):
    url = event['serverUrl']
    isOk = False
    n = 0
    while n < 10:
        if (isServerUpAdnRunning(url)):
            isOk = True
            break
        time.sleep(6)
        n = n + 1
    if not isOk:
        sendNotificationToSNS(url)


def isServerUpAdnRunning(url):
    try:
        with urlopen(url, timeout=10) as response:
            if response.status == 200:
                log.info('Server %s is up and running', url)
                return True
            else:
                log.error('Server %s is down, status: %s',
                          url, response.status)
                return False
    except Exception as error:
        log.error('Server %s is down, error: %s', url, str(error))
        return False


def sendNotificationToSNS(url):
    log.error('Server %s is down, sending notification to SNS', url)
    sns.publish(
        Subject="ClickStream ingestion server is down",
        TopicArn=topic_arn,
        Message='Server ' + url + ' is down'
    )
    return
