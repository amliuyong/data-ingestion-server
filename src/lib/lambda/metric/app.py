# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import logging
import os
import json
from datetime import datetime, timezone
from datetime import timedelta
import boto3

cloudwatch = boto3.client('cloudwatch')
ecs = boto3.client('ecs')
elbv2 = boto3.client('elbv2')

log = logging.getLogger()
log.setLevel('INFO')
aws_region = os.environ['AWS_REGION']
alb_full_name = os.environ['LOAD_BALANCER_FULL_NAME']
asg_name = os.environ['AUTO_SCALING_GROUP_NAME']

ecs_cluster_name = os.environ.get('ECS_CLUSTER_NAME', None)
ecs_service_name = os.environ.get('ECS_SERVICE_NAME', None)
target_group_arn = os.environ.get('TARGET_GROUP_ARN', None)

def handler(event, context):
    req_json = get_req_data(event)
    log.info(req_json)
    time_format = '%Y-%m-%dT%H:%M:%S%z'
    now_str_time = datetime.now().astimezone(timezone.utc).strftime(time_format)
    endTime = req_json.get('endTime', now_str_time)
    fromMinutesAgo = int(req_json.get('fromMinutesAgo', 24 * 60))
    minutes_ago = timedelta(minutes=fromMinutesAgo)
    startTime = (datetime.strptime(endTime, time_format) - minutes_ago).astimezone(timezone.utc).strftime(time_format)
    startTime = req_json.get('startTime', startTime)
    period = int(req_json.get('period', 300))

    log.info(f"fromMinutesAgo={fromMinutesAgo}")
    log.info(f"startTime={startTime}")
    log.info(f"endTime={endTime}")
    log.info(f"period={period}")

    metric_value = get_server_metric(startTime, endTime, period)
    ecs_service_state = get_ecs_service_state() if ecs_cluster_name and ecs_service_name else None
    target_state = get_healthy_state() if target_group_arn else None
 
    body = {
        "serverMetric": metric_value
    }

    if target_state:
        body['loadBalancerTargetState'] = target_state 
    if ecs_service_state:
        body['ecsServiceState'] = ecs_service_state
    
    server_state = 'GREEN'
    if target_state and ecs_service_state:
        if target_state['state'] == 'RED' or ecs_service_state['state'] == 'RED':
          server_state = 'RED'
        elif target_state['state'] == 'YELLOW' or ecs_service_state['state'] == 'YELLOW':
          server_state = 'YELLOW'
    elif target_state:
        server_state = target_state['state']
    elif ecs_service_state:
        server_state = ecs_service_state['state']

    body['state'] = server_state

    return {
        "statusCode": 200,
        "headers": {
           "Content-Type": "application/json",
           "Access-Control-Allow-Origin": "*",
           "Access-Control-Allow-Methods": "GET, OPTIONS"
        },
        "body": json.dumps(body),
    }

def get_req_data(event):
    if 'queryStringParameters' in event:
        # from api gateway
        req_json = event['queryStringParameters'] or {}
    else:
        # invoke lambda directly
        req_json = event
    return req_json


## Server metrics
def get_server_metric(startTime, endTime, period):
    # https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Statistics-definitions.html
    serverRequestCount = {
            'Id': 'serverRequestCount',
            'Label': 'Request Count',
            'MetricStat': {
                'Metric': {
                    'Namespace': 'AWS/ApplicationELB',
                    'MetricName': 'RequestCount',
                    'Dimensions': [
                        {
                            'Name': 'LoadBalancer',
                            'Value': alb_full_name
                        },
                    ]
                },
                'Period': period,
                'Stat': 'Sum',
                'Unit': 'Count'
            }
    }

    serverRequest4XXCount = {
            'Id': 'serverRequest4XXCount',
            'Label': 'Error Request Count(4XX)',
            'MetricStat': {
                'Metric': {
                    'Namespace': 'AWS/ApplicationELB',
                    'MetricName': 'HTTPCode_ELB_4XX_Count',
                    'Dimensions': [
                        {
                            'Name': 'LoadBalancer',
                            'Value': alb_full_name
                        },
                    ]
                },
                'Period': period,
                'Stat': 'Sum',
                'Unit': 'Count'
            },
    }

    serverRequest5XXCount = {
            'Id': 'serverRequest5XXCount',
            'Label': 'Error Request Count(5XX)',
            'MetricStat': {
                'Metric': {
                    'Namespace': 'AWS/ApplicationELB',
                    'MetricName': 'HTTPCode_ELB_5XX_Count',
                    'Dimensions': [
                        {
                            'Name': 'LoadBalancer',
                            'Value': alb_full_name
                        },
                    ]
                },
                'Period': period,
                'Stat': 'Sum',
                'Unit': 'Count'
            },
    }

    serverCPUUtilizationAverage = {
            'Id': 'serverCPUUtilizationAverage',
            'Label': 'Server CPU Utilization Average',
            'MetricStat': {
                'Metric': {
                    'Namespace': 'AWS/EC2',
                    'MetricName': 'CPUUtilization',
                    'Dimensions': [
                        {
                            'Name': 'AutoScalingGroupName',
                            'Value': asg_name
                        },
                    ]
                },
                'Period': period,
                'Stat': 'Average',
                'Unit': 'Percent'
            },
    }

    serverCPUUtilizationMax = {
            'Id': 'serverCPUUtilizationMax',
            'Label': 'Server CPU Utilization Max',
            'MetricStat': {
                'Metric': {
                    'Namespace': 'AWS/EC2',
                    'MetricName': 'CPUUtilization',
                    'Dimensions': [
                        {
                            'Name': 'AutoScalingGroupName',
                            'Value': asg_name
                        },
                    ]
                },
                'Period': period,
                'Stat': 'Maximum',
                'Unit': 'Percent'
            },
    }

    metric_alb_response = cloudwatch.get_metric_data(
        MetricDataQueries=[
            serverRequestCount, 
            serverRequest4XXCount, 
            serverRequest5XXCount
            ],
        StartTime=startTime,
        EndTime=endTime,
        ScanBy='TimestampAscending',
        MaxDatapoints=100800,
        LabelOptions={
            'Timezone': '+0000'
        })

    metric_asg_response = cloudwatch.get_metric_data(
        MetricDataQueries=[
            serverCPUUtilizationAverage,
            serverCPUUtilizationMax
            ],
        StartTime=startTime,
        EndTime=endTime,
        ScanBy='TimestampAscending',
        MaxDatapoints=100800,
        LabelOptions={
            'Timezone': '+0000'
        })

    metric_alb_value = [{
        'Id': metric_result['Id'], 
        'Label': metric_result['Label'], 
        'Timestamps': metric_result['Timestamps'],
        'Values': metric_result['Values'] 
       } for metric_result in metric_alb_response['MetricDataResults']]
    
    metric_asg_value = [{
        'Id': metric_result['Id'], 
        'Label': metric_result['Label'], 
        'Timestamps': metric_result['Timestamps'],
        'Values': metric_result['Values'] 
       } for metric_result in metric_asg_response['MetricDataResults']]

    metric_value = []
    metric_value.extend(metric_alb_value)
    metric_value.extend(metric_asg_value)

    return json.loads(json.dumps(metric_value, default=str))

## ECS Service State
def get_ecs_service_state():
    ecs_service_response = ecs.describe_services(
        cluster=ecs_cluster_name,
        services=[
           ecs_service_name,
        ],
    )

    if len(ecs_service_response['services']) == 0:
        ecsState = 'RED'
        detail = json.dumps({
            'ecsCluster': ecs_cluster_name,
            'message': 'services count is 0'
        })
    else:
        ecs_service = ecs_service_response['services'][0]
        if ecs_service['pendingCount'] > 0 and ecs_service['runningCount'] > 0:
            ecsState = 'YELLOW'
        elif ecs_service['desiredCount'] == ecs_service['runningCount']:
            ecsState = 'GREEN'
        elif ecs_service['runningCount'] == 0 and ecs_service['desiredCount'] > 0:
            ecsState = 'RED'
        detail = json.dumps(
            {
                'ecsCluster': ecs_cluster_name,
                'desiredTaskCount': ecs_service['desiredCount'],
                'runningTaskCount': ecs_service['runningCount'],
                'pendingTaskCount': ecs_service['pendingCount'],
            })
    
    ecs_service_state = { 
        'detail': detail,
        'state': ecsState
    }
    return ecs_service_state


## ALB target group State
def get_healthy_state():
    target_health_response = elbv2.describe_target_health(
         TargetGroupArn=target_group_arn,
    )
    total_targets_count = len(target_health_response['TargetHealthDescriptions'])
    unhealthy_targets = [ t['Target'] for t in target_health_response['TargetHealthDescriptions'] if t['TargetHealth']['State'] != 'healthy']
    unhealthy_targets_count = len(unhealthy_targets)

    state = 'RED'
    if unhealthy_targets_count == 0 and total_targets_count > 0:
        state = 'GREEN'
    elif unhealthy_targets_count < total_targets_count:
        state = 'YELLOW'
    
    target_healthy_state = {
        'detail': json.dumps(
            {   
                'targetGroupArn': target_group_arn,
                'targetCount': total_targets_count,
                'healthyCount': total_targets_count - unhealthy_targets_count,
                'unhealthyCount': unhealthy_targets_count
            }),
        'state': state,
    }
    return target_healthy_state