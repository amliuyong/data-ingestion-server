import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib";
import { addListECSTaskRole, addPoliciesToAsgRole } from "./iam";
import {
  BlockDeviceVolume,
  EbsDeviceVolumeType,
  HealthCheck,
} from "aws-cdk-lib/aws-autoscaling";
import {
  ECSClusterProps,
  EcsEc2NginxAsgSetting,
  EcsServiceResult,
  getEc2UserData,
} from "./ecs";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { AppConfig } from "./config";
import { addScalingPolicy, mountEFS } from "./ecs-util";
import {
  setDeleteClusterCustomResource,
  setEbsMountPoints,
} from "./ecs-ec2-service";

export function crateEC2NginxLogService(
  scope: Construct,
  props: ECSClusterProps,
  cluster: ecs.Cluster,
  ecsAsgSetting: EcsEc2NginxAsgSetting,
  nginxLogImage: ecs.ContainerImage,
  selectedSubnets: ec2.SubnetSelection,
  publicSubnet: boolean
): EcsServiceResult {
  if (!props.s3Config) {
    throw new Error("crateEC2NginxLogService props.s3Config is not set");
  }

  const isArm = ecsAsgSetting.isArm;
  const ecsConfig = {
    instanceType: new ec2.InstanceType(ecsAsgSetting.instanceType),
    machineImage: ecs.EcsOptimizedImage.amazonLinux2(
      isArm ? ecs.AmiHardwareType.ARM : ecs.AmiHardwareType.STANDARD
    ),
    platform: isArm ? Platform.LINUX_ARM64 : Platform.LINUX_AMD64,
  };

  const vpc = props.vpc;
  const autoScalingGroup = new cdk.aws_autoscaling.AutoScalingGroup(
    scope,
    "ecs-asg",
    {
      vpc,
      instanceType: ecsConfig.instanceType,
      machineImage: ecsConfig.machineImage,
      maxCapacity: ecsAsgSetting.ec2MaxCapacity,
      minCapacity: ecsAsgSetting.ec2MinCapacity,
      associatePublicIpAddress: publicSubnet,
      healthCheck: HealthCheck.ec2({
        grace: cdk.Duration.seconds(60),
      }),
      securityGroup: props.ecsSecurityGroup,
      vpcSubnets: selectedSubnets,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: BlockDeviceVolume.ebs(ecsAsgSetting.rootEbsVolume || 30, {
            volumeType: EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    }
  );

  autoScalingGroup.addUserData(...getEc2UserData());

  if (ecsAsgSetting.warmPoolSize && ecsAsgSetting.warmPoolSize > 0) {
    autoScalingGroup.addWarmPool({
      minSize: ecsAsgSetting.warmPoolSize,
    });
  }
  addPoliciesToAsgRole(scope, autoScalingGroup.role);
  const capacityProvider = new ecs.AsgCapacityProvider(
    scope,
    "ecs-capacity-provider",
    {
      autoScalingGroup,
    }
  );

  cluster.addAsgCapacityProvider(capacityProvider);

  const taskDefinition = new ecs.Ec2TaskDefinition(scope, "ecs-task-def", {
    networkMode: ecs.NetworkMode.AWS_VPC,
  });

  const nginxContainer = taskDefinition.addContainer("nginx-log", {
    image: nginxLogImage,
    memoryReservationMiB: ecsAsgSetting.nginxReservedMemory || 900,
    cpu: ecsAsgSetting.nginxCpu,
    portMappings: [
      {
        containerPort: 8088,
      },
    ],
    environment: {
      SERVER_ENDPOINT_PATH: AppConfig.serverEndpointPath(scope),
      WORKER_CONNECTIONS: `${ecsAsgSetting.nginxWorkerConnections}`,
      AWS_S3_BUCKET: props.s3Config.bucketName,
      AWS_S3_PREFIX: props.s3Config.prefix,
      USE_EFS: ecsAsgSetting.attachEFS ? "true" : "false",
    },
    logging: ecs.LogDriver.awsLogs({
      streamPrefix: "nginx-log",
    }),
  });

  const minHealthyPercent = ecsAsgSetting.ecsTaskMaxCapacity == 1 ? 0 : 50;

  const ecsService = new ecs.Ec2Service(scope, "ecs-service", {
    cluster,
    taskDefinition,
    securityGroups: [props.ecsSecurityGroup],
    assignPublicIp: false,
    healthCheckGracePeriod: cdk.Duration.seconds(60),
    minHealthyPercent,
    enableExecuteCommand: true,
    capacityProviderStrategies: [
      {
        capacityProvider: capacityProvider.capacityProviderName,
        weight: 1,
      },
    ],
  });
  addScalingPolicy(ecsService, ecsAsgSetting);

  if (ecsAsgSetting.attachEFS) {
    const efs = mountEFS(scope, {
      efsName: "efs",
      vpc: props.vpc,
      taskDefinition,
      ecsSecurityGroup: props.ecsSecurityGroup,
      httpContainer: nginxContainer,
    });
    ecsService.node.addDependency(efs);
  } else {
    setEbsMountPoints({
      vpc: props.vpc,
      taskDefinition,
      ecsSecurityGroup: props.ecsSecurityGroup,
      httpContainer: nginxContainer,
    });
  }

  addListECSTaskRole(scope, taskDefinition.taskRole, cluster.clusterName);

  setDeleteClusterCustomResource(
    scope,
    cluster,
    ecsService,
    capacityProvider,
    autoScalingGroup
  );

  return {
    ecsService,
    taskDefinition,
    httpContainerName: nginxContainer.containerName,
    autoScalingGroup,
  };
}
