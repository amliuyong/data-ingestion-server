import * as efs from "aws-cdk-lib/aws-efs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { RemovalPolicy } from "aws-cdk-lib";
import { getServiceSubnets, vpcFromId } from "./vpc";

export function createEFS(
  scope: Construct,
  props: {
    vpc: ec2.IVpc;
    efsName: string;
  }
) {
  const fileSystem = new efs.FileSystem(scope, props.efsName, {
    vpc: props.vpc,
    vpcSubnets: getServiceSubnets(props.vpc, "efs.FileSystem").selectedSubnets,
    lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS, // files are not transitioned to infrequent access (IA) storage by default
    performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
    outOfInfrequentAccessPolicy: efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS, // files are not transitioned back from (infrequent access) IA to primary storage by default
    removalPolicy: RemovalPolicy.DESTROY,
  });
  
  return fileSystem;
}
