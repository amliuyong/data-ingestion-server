import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib";
import { ECSClusterProps, EcsFargateSetting, EcsServiceResult } from "./ecs";
import { AppConfig } from "./config";
import {
  addScalingPolicy,
  getVectorEnvs,
  getVectorPortMappings,
  mountEFS,
} from "./ecs-util";

export function createFargateService(
  scope: Construct,
  props: ECSClusterProps,
  cluster: ecs.Cluster,
  fargateSetting: EcsFargateSetting,
  nginxImage: ecs.ContainerImage,
  vectorImage: ecs.ContainerImage,
  selectedSubnets: ec2.SubnetSelection,
  publicSubnet: boolean
): EcsServiceResult {
  let cpuArchitecture = ecs.CpuArchitecture.X86_64;
  if (fargateSetting.useArm) {
    cpuArchitecture = ecs.CpuArchitecture.ARM64;
  }
  const fargateTaskDefinition = new ecs.FargateTaskDefinition(
    scope,
    "ecs-fargate-task-def",
    {
      cpu: fargateSetting.taskCpu,
      memoryLimitMiB: fargateSetting.taskMemoryLimitMiB,
      runtimePlatform: {
        cpuArchitecture,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      ephemeralStorageGiB: fargateSetting?.ephemeralStorageGiB || 30,
    }
  );

  const nginxContainer = fargateTaskDefinition.addContainer("nginx-fragate", {
    image: nginxImage,
    memoryReservationMiB: 900,
    cpu: fargateSetting.nginxCpu,
    portMappings: [
      {
        containerPort: 8088,
      },
    ],
    environment: {
      SERVER_ENDPOINT_PATH: AppConfig.serverEndpointPath(scope),
      WORKER_CONNECTIONS: `${fargateSetting.nginxWorkerConnections}`,
    },
    logging: ecs.LogDriver.awsLogs({
      streamPrefix: "nginx-fargate",
    }),
  });

  const vectorContainer = fargateTaskDefinition.addContainer("vector-fargate", {
    image: vectorImage,
    memoryReservationMiB: 900,
    cpu: fargateSetting.vectorCpu,
    portMappings: getVectorPortMappings(),
    environment: getVectorEnvs(scope, props),
    logging: ecs.LogDriver.awsLogs({
      streamPrefix: "vector-fargate",
    }),
  });

  const ecsFargateService = new ecs.FargateService(
    scope,
    "ecs-fargate-service",
    {
      cluster,
      taskDefinition: fargateTaskDefinition,
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: publicSubnet,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      minHealthyPercent: 50,
      vpcSubnets: selectedSubnets,
    }
  );

  addScalingPolicy(ecsFargateService, fargateSetting);
  if (fargateSetting.attachEFS) {
    const efs = mountEFS(scope, {
      efsName: "efs-fargate",
      vpc: props.vpc,
      taskDefinition: fargateTaskDefinition,
      ecsSecurityGroup: props.ecsSecurityGroup,
      vectorContainer,
      httpContainer: nginxContainer,
    });
    ecsFargateService.node.addDependency(efs);
  }

  return {
    ecsService: ecsFargateService,
    taskDefinition: fargateTaskDefinition,
    httpContainerName: nginxContainer.containerName,
  };
}
