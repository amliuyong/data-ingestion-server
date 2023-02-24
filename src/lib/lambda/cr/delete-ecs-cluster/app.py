import boto3
import os
import logging
import time
import json

log = logging.getLogger()
log.setLevel('INFO')
aws_region = os.environ['AWS_REGION']
ecs_cluster_name = os.environ['ECS_CLUSTER_NAME']
ecs_service = os.environ['ECS_SERVICE']
ecs_task_name = os.environ['ECS_TASK_NAME']
asg_name = os.environ['ASG_NAME']

ecs_client = boto3.client('ecs')
asg_client = boto3.client('autoscaling')


def handler(event, context):
    log.info("ecs_cluster_name:" + ecs_cluster_name)
    log.info("ecs_service:" + ecs_service)
    log.info("ecs_task_name:" + ecs_service)
    log.info("asg_name:" + asg_name)
    RequestType = event.get('RequestType')
    if RequestType != 'Delete':
        return

    error_message = None
    try:
        del_ecs_resource()
    except Exception as e:
        log.error(repr(e))
        error_message = repr(e)

    del_asg()

    return {
        "Data": {
            "cluster_name": ecs_cluster_name,
            "deleted_service": ecs_service,
            "autoscaling_group_name": asg_name,
            "error_message": error_message
        }
    }


def del_asg():
    log.info(f"del_asg ... {asg_name}")
    try:
        asg_client.delete_auto_scaling_group(
            AutoScalingGroupName=asg_name,
            ForceDelete=True)
    except Exception as e:
        log.error(repr(e))
    time.sleep(10)


def del_ecs_resource():
    log.info("del_ecs_resource ...")
    res = ecs_client.describe_services(
        cluster=ecs_cluster_name,
        services=[ecs_service])
    status = res['services'][0]['status']
    ecs_service_active = status != 'INACTIVE'
    if ecs_service_active:
        update_service()
    delete_service()
    del_cluster()
    time.sleep(10)


def del_cluster():
    log.info(f"delete_cluster ...")
    try:
        log.info(f"list_container_instances ...")
        res = ecs_client.list_container_instances(cluster=ecs_cluster_name)
        containerInstanceArns = res['containerInstanceArns']
        log.info(f"containerInstanceArns = {containerInstanceArns}")
        log.info(f"deregister_container_instance ...")
        def deregister_instance(arn): return ecs_client.deregister_container_instance(
            cluster=ecs_cluster_name, containerInstance=arn, force=True)
        [deregister_instance(arn) for arn in containerInstanceArns]
        time.sleep(10)
        ecs_client.delete_cluster(cluster=ecs_cluster_name)
    except ecs_client.exceptions.ClusterNotFoundException as e:
        log.error(repr(e))
        pass


def update_service():
    log.info(f"update_service {ecs_service}, set desiredCount=0")
    try:
        res = ecs_client.update_service(
            cluster=ecs_cluster_name,
            service=ecs_service,
            desiredCount=0)
        time.sleep(15)
    except ecs_client.exceptions.ServiceNotActiveException as e:
        log.error(repr(e))
        return

    stop_tasks()
    show_tasks()

    while True:
        res = ecs_client.describe_services(
            cluster=ecs_cluster_name,
            services=[ecs_service])

        runningCount = res['services'][0]['runningCount']
        desiredCount = res['services'][0]['desiredCount']
        pendingCount = res['services'][0]['pendingCount']
        status = res['services'][0]['status']

        log.info(
            f"service status: {status}, runningCount: {runningCount}, desiredCount: {desiredCount}, pendingCount: {pendingCount}")
        if runningCount == 0:
            break
        else:
            time.sleep(20)
    show_tasks()


def stop_tasks():
    log.info(f"stop_tasks ...")
    try:
        res = ecs_client.list_tasks(
            cluster=ecs_cluster_name,
            serviceName=ecs_service)
        taskArns = res['taskArns']
        log.info(f"find {len(taskArns)} tasks")

        def stop_task(task_arn): return ecs_client.stop_task(
            cluster=ecs_cluster_name,
            task=task_arn,
            reason='stop by cloudformation custom resource')

        [stop_task(arn) for arn in taskArns]
    except Exception as e:
        log.error(repr(e))


def show_tasks():
    log.info(f"list_tasks for {ecs_task_name}")
    tasks = ecs_client.list_tasks(
        cluster=ecs_cluster_name,
        family=ecs_task_name,
    )
    log.info(f"taskArns ... {tasks['taskArns']}")


def delete_service():
    log.info(f"delete_service {ecs_service}")
    try:
        ecs_client.delete_service(
            cluster=ecs_cluster_name,
            service=ecs_service,
            force=True)
    except ecs_client.exceptions.ServiceNotFoundException as e:
        log.error(repr(e))
        pass
