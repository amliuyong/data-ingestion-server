import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct, IConstruct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib";
import { addPoliciesToAsgRole } from "./iam";
import {
  BlockDeviceVolume,
  EbsDeviceVolumeType,
  HealthCheck,
} from "aws-cdk-lib/aws-autoscaling";
import { ECSClusterProps, EcsEc2NginxAndVectorAsgSetting, EcsServiceResult, getEc2UserData } from "./ecs";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { AppConfig } from "./config";
import { IAspect, Aspects } from "aws-cdk-lib";
import { createDeleteClusterCustomResource } from "./custom-resource";
import {
  addScalingPolicy,
  getVectorEnvs,
  getVectorPortMappings,
  mountEFS,
} from "./ecs-util";

export function crateEC2Service(
  scope: Construct,
  props: ECSClusterProps,
  cluster: ecs.Cluster,
  ecsAsgSetting: EcsEc2NginxAndVectorAsgSetting,
  nginxImage: ecs.ContainerImage,
  vectorImage: ecs.ContainerImage,
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

  const nginxContainer = taskDefinition.addContainer("nginx", {
    image: nginxImage,
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
    },
    logging: ecs.LogDriver.awsLogs({
      streamPrefix: "nginx",
    }),
  });

  const vectorContainer = taskDefinition.addContainer("vector", {
    image: vectorImage,
    memoryReservationMiB: ecsAsgSetting.vectorReservedMemory || 900,
    cpu: ecsAsgSetting.vectorCpu,
    portMappings: getVectorPortMappings(),
    environment: getVectorEnvs(scope, props),
    logging: ecs.LogDriver.awsLogs({
      streamPrefix: "vector",
    }),
  });

  // XSMALL only has one task
  const minHealthyPercent = ecsAsgSetting.ecsTaskMaxCapacity == 1 ? 0 : 50;

  const ecsService = new ecs.Ec2Service(scope, "ecs-service", {
    cluster,
    taskDefinition,
    //desiredCount: asgConfig.ecsTaskMinCapacity,
    securityGroups: [props.ecsSecurityGroup],
    assignPublicIp: false,
    healthCheckGracePeriod: cdk.Duration.seconds(60),
    minHealthyPercent,
    //circuitBreaker: { rollback: true },
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
      vectorContainer,
      httpContainer: nginxContainer,
    });
    ecsService.node.addDependency(efs);
  } else {
    setEbsMountPoints({
      vpc: props.vpc,
      taskDefinition,
      ecsSecurityGroup: props.ecsSecurityGroup,
      vectorContainer,
      httpContainer: nginxContainer,
    });
  }

  setDeleteClusterCustomResource(scope, cluster, ecsService, capacityProvider, autoScalingGroup);

  return {
    ecsService,
    taskDefinition,
    httpContainerName: nginxContainer.containerName,
    autoScalingGroup,
  };
}

export function setDeleteClusterCustomResource(
  scope: Construct,
  cluster: ecs.Cluster,
  ecsService: ecs.Ec2Service,
  capacityProvider: ecs.AsgCapacityProvider,
  autoScalingGroup: cdk.aws_autoscaling.AutoScalingGroup
) {
  const deleteClusterCustomResource = createDeleteClusterCustomResource(scope, {
    clusterName: cluster.clusterName,
    service: ecsService.serviceName,
    taskName: ecsService.taskDefinition.family,
    asgName: autoScalingGroup.autoScalingGroupName,
  });

  ecsService.node.addDependency(capacityProvider);
  ecsService.node.addDependency(cluster);
  ecsService.node.addDependency(autoScalingGroup);

  deleteClusterCustomResource.node.addDependency(capacityProvider);
  deleteClusterCustomResource.node.addDependency(ecsService);
  deleteClusterCustomResource.node.addDependency(cluster);
  deleteClusterCustomResource.node.addDependency(autoScalingGroup);
  Aspects.of(scope).add(new Dependency(deleteClusterCustomResource));
}

export function setEbsMountPoints(props: {
  vpc: ec2.IVpc;
  taskDefinition: ecs.Ec2TaskDefinition;
  ecsSecurityGroup: ec2.SecurityGroup;
  httpContainer: ecs.ContainerDefinition;
  vectorContainer?: ecs.ContainerDefinition;
}) {
  props.taskDefinition.addVolume({
    name: "host",
    host: {
      sourcePath: "/var/log",
    },
  });

  const nginxMountPoint = {
    containerPath: "/var/log",
    readOnly: false,
    sourceVolume: "host",
  };
  props.httpContainer.addMountPoints(nginxMountPoint);

  if (props.vectorContainer) {
    const vectorMountPoint = {
      containerPath: "/var/lib",
      readOnly: false,
      sourceVolume: "host",
    };
    props.vectorContainer.addMountPoints(vectorMountPoint);
  }
}

export class Dependency implements IAspect {
  deleteClusterCustomResource: cdk.CustomResource;

  constructor(deleteClusterCustomResource: cdk.CustomResource) {
    this.deleteClusterCustomResource = deleteClusterCustomResource;
  }
  visit(node: IConstruct): void {
    if (node instanceof ecs.CfnClusterCapacityProviderAssociations) {
      this.deleteClusterCustomResource.node.addDependency(node);
    }
  }
}
