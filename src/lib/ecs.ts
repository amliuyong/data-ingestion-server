import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import {
  createJavaServerECRImage,
  createNginxAndVectorECRImages,
  createNginxLogECRImage,
  createNginxLuaECRImage,
} from "./ecr";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import {
  ServiceType,
  KinesisSinkConfig,
  MskSinkConfig,
  S3SinkConfig,
} from "./stack-main";
import { getServiceSubnets } from "./vpc";
import { createFargateService } from "./ecs-fargate-service";
import { crateEC2Service } from "./ecs-ec2-service";
import { crateEC2LuaService } from "./ecs-ec2-lua-service";
import { crateEC2NginxLogService } from "./ecs-ec2-nginx-log-service";
import { crateEC2JavaService } from "./ecs-ec2-java-service";

export interface EcsEc2ServerAsgSetting {
  ec2MinCapacity: number;
  ec2MaxCapacity: number;
  ecsTaskMinCapacity: number;
  ecsTaskMaxCapacity: number;
  instanceType: string;
  isArm: boolean;
  warmPoolSize?: number;
  rootEbsVolume?: number;
  attachEFS?: boolean;
  reservedMemory?: number;
  cpu?: number;
}

export interface EcsEc2NginxAsgSetting extends EcsEc2ServerAsgSetting {
  nginxReservedMemory?: number;
  nginxCpu: number;
  nginxWorkerConnections: number;
}

export interface EcsEc2NginxAndVectorAsgSetting extends EcsEc2NginxAsgSetting {
  vectorReservedMemory?: number;
  vectorCpu: number;
  vectorSetting: VectorSetting;
}

export interface VectorSetting {
  vectorThreads: number;
  vectorStreamAckEnable: boolean;
  vectorRequireHealthy: boolean;
}
export interface EcsFargateSetting {
  ecsTaskMaxCapacity: number;
  ecsTaskMinCapacity: number;
  taskCpu: number;
  taskMemoryLimitMiB: number;
  nginxCpu: number;
  vectorCpu: number;
  ephemeralStorageGiB?: number;
  attachEFS?: boolean;
  useArm: boolean;
  vectorSetting: VectorSetting;
  nginxWorkerConnections: number;
}

export enum EcsLaunchType {
  EC2 = "EC2",
  FARGATE = "FARGATE",
}

export interface ECSClusterProps {
  vpc: ec2.IVpc;
  ecsServiceType: ServiceType;
  ecsEc2NginxAndVectorAsgSetting?: EcsEc2NginxAndVectorAsgSetting;
  ecsEc2LuaNginxAsgSetting?: EcsEc2NginxAsgSetting;
  ecsFargateSetting?: EcsFargateSetting;
  ecsEc2NginxLogAsgSetting?: EcsEc2NginxAsgSetting;
  ecsEc2JavaServerAsgSetting?: EcsEc2ServerAsgSetting;
  ecsSecurityGroup: ec2.SecurityGroup;
  s3Config?: S3SinkConfig;
  mskConfig?: MskSinkConfig;
  kinesisConfig?: KinesisSinkConfig;
}

export interface EcsServiceResult {
  ecsService: ecs.Ec2Service | ecs.FargateService;
  taskDefinition: ecs.TaskDefinition;
  httpContainerName: string;
  autoScalingGroup?: cdk.aws_autoscaling.AutoScalingGroup;
}
export interface EcsClusterResult extends EcsServiceResult {
  cluster: ecs.Cluster;
}

export function createECSClusterAndService(
  scope: Construct,
  props: ECSClusterProps
): EcsClusterResult {
  const vpc = props.vpc;
  const cluster = new ecs.Cluster(scope, "ecs-cluster", {
    vpc,
  });

  const ecsServiceType = props.ecsServiceType;
  const { selectedSubnets, publicSubnet } = getServiceSubnets(vpc, "ECS.Vpc");

  let ecsServiceInfo: EcsServiceResult;

  if (ecsServiceType == ServiceType.ECS_EC2_NGINX_VECTOR) {
    // EC2: Nginx + Vector
    const ecsEc2NginxAndVectorAsgSetting = props.ecsEc2NginxAndVectorAsgSetting;
    if (!ecsEc2NginxAndVectorAsgSetting) {
      throw new Error(
        "ecsEc2NginxAndVectorAsgSetting not set for ecsServiceType: " +
          ecsServiceType
      );
    }
    const ecsConfig = getEcsPlatformConfig(ecsEc2NginxAndVectorAsgSetting);

    const { nginxImage, vectorImage } = createNginxAndVectorECRImages(
      scope,
      ecsConfig.platform
    );
    ecsServiceInfo = crateEC2Service(
      scope,
      props,
      cluster,
      ecsEc2NginxAndVectorAsgSetting,
      nginxImage,
      vectorImage,
      selectedSubnets,
      publicSubnet
    );
  } else if (ecsServiceType == ServiceType.ECS_EC2_NGINX_LUA) {
    const ecsEc2LuaNginxAsgSetting = props.ecsEc2LuaNginxAsgSetting;

    if (!ecsEc2LuaNginxAsgSetting) {
      throw new Error(
        "ecsEc2LuaNginxAsgSetting not set for ecsServiceType: " + ecsServiceType
      );
    }

    const ecsConfig = getEcsPlatformConfig(ecsEc2LuaNginxAsgSetting);

    const { nginxLuaImage } = createNginxLuaECRImage(scope, ecsConfig.platform);
    // EC2 Lua only Nginx
    ecsServiceInfo = crateEC2LuaService(
      scope,
      props,
      cluster,
      ecsEc2LuaNginxAsgSetting,
      nginxLuaImage,
      selectedSubnets,
      publicSubnet
    );
  } else if (ecsServiceType == ServiceType.ECS_FARGATE_NGINX_VECTOR) {
    // FARGATE: Nginx + Vector
    let fargateSetting = props.ecsFargateSetting;

    if (!fargateSetting) {
      throw new Error(
        "fargateSetting not set for ecsLaunchType: " + ecsServiceType
      );
    }

    const platform = !fargateSetting!.useArm
      ? Platform.LINUX_ARM64
      : Platform.LINUX_AMD64;

    const { nginxImage, vectorImage } = createNginxAndVectorECRImages(
      scope,
      platform
    );

    ecsServiceInfo = createFargateService(
      scope,
      props,
      cluster,
      fargateSetting,
      nginxImage,
      vectorImage,
      selectedSubnets,
      publicSubnet
    );
  } else if (ecsServiceType == ServiceType.ECS_EC2_NGINX_LOG) {
    const ecsEc2NginxLogAsgSetting = props.ecsEc2NginxLogAsgSetting;

    if (!ecsEc2NginxLogAsgSetting) {
      throw new Error(
        "ecsEc2NginxLogAsgSetting not set for ecsServiceType: " + ecsServiceType
      );
    }

    const ecsConfig = getEcsPlatformConfig(ecsEc2NginxLogAsgSetting);

    const { nginxLogImage } = createNginxLogECRImage(scope, ecsConfig.platform);
    // EC2: Nginx Log only
    ecsServiceInfo = crateEC2NginxLogService(
      scope,
      props,
      cluster,
      ecsEc2NginxLogAsgSetting,
      nginxLogImage,
      selectedSubnets,
      publicSubnet
    );
  } else if (ecsServiceType == ServiceType.ECS_EC2_JAVA_SERVER) {
    const ecsEc2JavaServerAsgSetting = props.ecsEc2JavaServerAsgSetting;

    if (!ecsEc2JavaServerAsgSetting) {
      throw new Error(
        "ecsEc2JavaServerAsgSetting not set for ecsServiceType: " +
          ecsServiceType
      );
    }

    const ecsConfig = getEcsPlatformConfig(ecsEc2JavaServerAsgSetting);

    const { javaServerImage } = createJavaServerECRImage(scope, ecsConfig.platform);
    // EC2: Java server
    ecsServiceInfo = crateEC2JavaService(
      scope,
      props,
      cluster,
      ecsEc2JavaServerAsgSetting,
      javaServerImage,
      selectedSubnets,
      publicSubnet
    );
  } else {
    throw new TypeError("Invalid ECS ecsServiceType: " + ecsServiceType);
  }

  return { ...ecsServiceInfo, cluster };
}

function getEcsPlatformConfig(ecsEc2AsgSetting: {
  isArm: boolean;
  instanceType: string;
}) {
  const isArm = ecsEc2AsgSetting.isArm;
  const ecsConfig = {
    instanceType: new ec2.InstanceType(ecsEc2AsgSetting.instanceType),
    machineImage: ecs.EcsOptimizedImage.amazonLinux2(
      isArm ? ecs.AmiHardwareType.ARM : ecs.AmiHardwareType.STANDARD
    ),
    platform: isArm ? Platform.LINUX_ARM64 : Platform.LINUX_AMD64,
  };
  return ecsConfig;
}

export function getEc2UserData(): string[] {
  return [
    `echo "net.core.somaxconn = 32768">> /etc/sysctl.conf`,
    `echo "net.ipv4.tcp_max_syn_backlog = 32768">> /etc/sysctl.conf`,
    `echo "net.ipv4.ip_local_port_range = 1024 65535">> /etc/sysctl.conf`,
    `sysctl -p`,
  ];
}
