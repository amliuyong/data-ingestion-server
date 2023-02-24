import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { ECSClusterProps } from "./ecs";
import { createEFS } from "./efs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { ServiceType } from "./stack-main";

export function addScalingPolicy(
  ecsService: ecs.Ec2Service | ecs.FargateService,
  asgTaskConfig: {
    ecsTaskMaxCapacity: number;
    ecsTaskMinCapacity: number;
  }
) {
  const scaling = ecsService.autoScaleTaskCount({
    maxCapacity: asgTaskConfig.ecsTaskMaxCapacity,
    minCapacity: asgTaskConfig.ecsTaskMinCapacity,
  });
  scaling.scaleOnCpuUtilization("CpuScaling", {
    targetUtilizationPercent: 50,
    scaleInCooldown: cdk.Duration.minutes(45),
    scaleOutCooldown: cdk.Duration.minutes(1),
  });
}

export function getVectorEnvs(scope: Construct, props: ECSClusterProps) {
  let vectorThreads = 1;
  let vectorRequireHealthy = false;
  let streamAckEnable = true;
  if (props.ecsServiceType == ServiceType.ECS_EC2_NGINX_VECTOR) {
    vectorThreads = props.ecsEc2NginxAndVectorAsgSetting?.vectorSetting.vectorThreads || 1;
    streamAckEnable = props.ecsEc2NginxAndVectorAsgSetting? props.ecsEc2NginxAndVectorAsgSetting.vectorSetting.vectorStreamAckEnable : true;
  }
  if (props.ecsServiceType == ServiceType.ECS_FARGATE_NGINX_VECTOR) {
    vectorThreads = props.ecsFargateSetting?.vectorSetting.vectorThreads || 1;
    vectorRequireHealthy = props.ecsFargateSetting?.vectorSetting.vectorRequireHealthy || false;
    streamAckEnable = props.ecsFargateSetting? props.ecsFargateSetting.vectorSetting.vectorStreamAckEnable : true;
  }

  return {
    AWS_REGION: cdk.Stack.of(scope).region,
    AWS_S3_BUCKET: props.s3Config?.bucketName || "__NOT_SET__",
    AWS_S3_PREFIX: props.s3Config?.prefix || "__NOT_SET__",
    AWS_MSK_BROKERS: props.mskConfig?.mskBrokers || "__NOT_SET__",
    AWS_MSK_TOPIC: props.mskConfig?.mskTopic || "__NOT_SET__",
    AWS_KINESIS_STREAM_NAME: props.kinesisConfig?.streamName || "__NOT_SET__",
    VECTOR_REQUIRE_HEALTHY: `${vectorRequireHealthy}`,
    STREAM_ACK_ENABLE: `${streamAckEnable}`,
    VECTOR_THREADS_NUM: `${vectorThreads}`,
  };
}

export function getVectorPortMappings() {
  return [
    {
      containerPort: 8684,
    },
    {
      containerPort: 8685,
    },
    {
      containerPort: 8686,
    },
  ];
}

export function mountEFS(
  scope: Construct,
  props: {
    efsName: string;
    vpc: ec2.IVpc;
    taskDefinition: ecs.Ec2TaskDefinition;
    ecsSecurityGroup: ec2.SecurityGroup;
    httpContainer: ecs.ContainerDefinition;
    vectorContainer?: ecs.ContainerDefinition;
  }
) {
  const efs = createEFS(scope, { vpc: props.vpc, efsName: props.efsName });
  props.taskDefinition.addVolume({
    name: "efs",
    efsVolumeConfiguration: {
      fileSystemId: efs.fileSystemId,
      rootDirectory: "/",
    },
  });

  const nginxEfsMountPoint = {
    containerPath: "/var/log/",
    readOnly: false,
    sourceVolume: "efs",
  };

  if (props.vectorContainer) {
    const vectorEfsMountPoint = {
      containerPath: "/var/lib/",
      readOnly: false,
      sourceVolume: "efs",
    };

    props.vectorContainer.addMountPoints(vectorEfsMountPoint);
  }

  props.httpContainer.addMountPoints(nginxEfsMountPoint);
  efs.grant(
    props.taskDefinition.taskRole,
    "elasticfilesystem:ClientWrite",
    "elasticfilesystem:ClientRead"
  );
  efs.connections.allowDefaultPortFrom(props.ecsSecurityGroup);

  return efs;
}
