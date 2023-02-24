import boto3
import os
import logging
import base64
import json
import uuid
import gzip
from datetime import datetime

s3 = boto3.client('s3')

log = logging.getLogger()
log.setLevel('INFO')
aws_region = os.environ['AWS_REGION']

s3_bucket = os.environ['AWS_S3_BUCKET']
s3_prefix = os.environ['AWS_S3_PREFIX']

if s3_prefix.endswith('/'):
    s3_prefix = s3_prefix[:-1]


def handler(event, context):
    partition = datetime.utcnow().strftime('year=%Y/month=%m/day=%d/hour=%H')
    lines = [process(record) for record in event['Records']]
    lines = [line for line in lines if line is not None]
    log.info("get records count: {}".format(len(lines)))
    if (len(lines) == 0):
         return
    
    file_name = f"{uuid.uuid4()}.log.gz"
    file_content = "\n".join(lines)
    key = f"{s3_prefix}/{partition}/{file_name}"
    string_to_s3(file_content, s3_bucket, key, True)


def string_to_s3(content, bucket, key, zip=False):
    if zip:
        bin_body = gzip.compress(content.encode("utf-8"))
        s3.put_object(
            Body=bin_body,
            Bucket=bucket,
            Key=key,
            ContentType='application/x-gzip'
            # ContentType='binary/octet-stream'
        )
    else:
        bin_body = content.encode("utf-8")
        s3.put_object(
            Body=bin_body,
            Bucket=bucket,
            Key=key,
            ContentType='text/plain'
        )
    log.info("put_object: s3://{}/{}".format(bucket, key))


def process(record):
    data_b64 = record['kinesis']['data']
    try:
        data_raw = decode(data_b64)
    except Exception as error:
        log.error(error)
        log.error("can not decode data_b64:" + data_b64)
        return None

    # make source one line
    try:
        return json.dumps(json.loads(data_raw))
    except:
        # remove new line from string
        data_raw = data_raw.replace('\n', '')
        return data_raw


def decode(base64_str):
    decoded_bytes = base64.b64decode(base64_str)
    decoded_str = str(decoded_bytes, "utf-8")
    return decoded_str
