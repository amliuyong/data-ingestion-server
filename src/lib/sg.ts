import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export function createALBSecurityGroup(
  scope: Construct,
  vpc: ec2.IVpc,
  port: {
    http: number,
    https: number
  }
): ec2.SecurityGroup {
  const albSg = new ec2.SecurityGroup(scope, "alb-sg", {
    description: "ALB security group",
    vpc,
    allowAllOutbound: true,
  });
  albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(port.https));
  albSg.addIngressRule(ec2.Peer.anyIpv4(),ec2.Port.tcp(port.http));
  return albSg;
}

export function createECSSecurityGroup(
  scope: Construct,
  vpc: ec2.IVpc,
): ec2.SecurityGroup {
  const ec2Sg = new ec2.SecurityGroup(scope, "ecs-sg", {
    description: "ECS security group",
    vpc,
    allowAllOutbound: true,
  });
  ec2Sg.addIngressRule(ec2Sg, ec2.Port.allTcp());
  return ec2Sg;
}

export function createMSKSecurityGroup(
  scope: Construct,
  vpc: ec2.IVpc,
): ec2.SecurityGroup {
  const mskSg = new ec2.SecurityGroup(scope, "msk-sg", {
    description: "MSK security group",
    vpc,
    allowAllOutbound: true,
  });

  mskSg.addIngressRule(mskSg, ec2.Port.allTcp());
  return mskSg;
}

export function createMskCustomResourceLambdaSecurityGroup(
  scope: Construct,
  vpc: ec2.IVpc,
  mskSg: ec2.ISecurityGroup
) {
  const lambdaSg = new ec2.SecurityGroup(scope, "msk-cr-lambda-sg", {
    description: "MSK custom resource lambda security group",
    vpc,
    allowAllOutbound: true,
  });
  //https://docs.aws.amazon.com/msk/latest/developerguide/port-info.html
  lambdaSg.addIngressRule(lambdaSg, ec2.Port.allTcp());
  // mskSg.addIngressRule(lambdaSg, ec2.Port.tcp(2181));
  // mskSg.addIngressRule(lambdaSg, ec2.Port.tcp(9094));
  mskSg.addIngressRule(lambdaSg, ec2.Port.tcpRange(9092, 9098));
  return lambdaSg;
}

export function createLambdaServerSecurityGroup(
  scope: Construct,
  vpc: ec2.IVpc,
): ec2.SecurityGroup {
  const sg = new ec2.SecurityGroup(scope, "lambda-server-sg", {
    description: "Lambda server sg",
    vpc,
    allowAllOutbound: true,
  });
  sg.addIngressRule(sg, ec2.Port.allTcp());
  return sg;
}


export function createKinesisToS3LambdaSecurityGroup(
  scope: Construct,
  vpc: ec2.IVpc,
): ec2.SecurityGroup {
  const sg = new ec2.SecurityGroup(scope, "lambda-kinesis-to-s3-sg", {
    description: "Lambda kinesis to s3sg",
    vpc,
    allowAllOutbound: true,
  });
  sg.addIngressRule(sg, ec2.Port.allTcp());
  return sg;
}
