import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib";
import { addPoliciesToAsgRole } from "./iam";
import {
  BlockDeviceVolume,
  EbsDeviceVolumeType,
  HealthCheck,
} from "aws-cdk-lib/aws-autoscaling";
import { ECSClusterProps, EcsEc2ServerAsgSetting, EcsServiceResult, getEc2UserData } from "./ecs";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import {
  addScalingPolicy,
  mountEFS,
} from "./ecs-util";
import { setDeleteClusterCustomResource, setEbsMountPoints } from "./ecs-ec2-service";
import { Stack } from "aws-cdk-lib";

export function crateEC2JavaService(
  scope: Construct,
  props: ECSClusterProps,
  cluster: ecs.Cluster,
  ecsAsgSetting: EcsEc2ServerAsgSetting,
  javaServerImage: ecs.ContainerImage,
  selectedSubnets: ec2.SubnetSelection,
  publicSubnet: boolean
): EcsServiceResult {
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

  autoScalingGroup.addUserData( ... getEc2UserData());

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

  const httpContainer = taskDefinition.addContainer("java-server", {
    image: javaServerImage,
    memoryReservationMiB: ecsAsgSetting.reservedMemory || 3072,
    cpu: ecsAsgSetting.cpu,
    portMappings: [
      {
        containerPort: 8088,
      },
    ],
    environment: {
      AWS_MSK_BROKERS: props.mskConfig?.mskBrokers || "__NOT_SET__",
      AWS_MSK_TOPIC: props.mskConfig?.mskTopic || "__NOT_SET__",
      AWS_REGION: Stack.of(scope).region,
      AWS_KINESIS_STREAM_NAME: props.kinesisConfig?.streamName ||  "__NOT_SET__",
    },
    logging: ecs.LogDriver.awsLogs({
      streamPrefix: "java-server",
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
      httpContainer,
    });
    ecsService.node.addDependency(efs);
  } else {
    setEbsMountPoints({
      vpc: props.vpc,
      taskDefinition,
      ecsSecurityGroup: props.ecsSecurityGroup,
      httpContainer,
    });
  }
  setDeleteClusterCustomResource(scope, cluster, ecsService, capacityProvider, autoScalingGroup);

  return {
    ecsService,
    taskDefinition,
    httpContainerName: httpContainer.containerName,
    autoScalingGroup,
  };
}



