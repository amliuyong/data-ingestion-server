import * as cdk from "aws-cdk-lib";
import {
  StackProps,
  aws_ec2 as ec2,
  aws_ssm as ssm
} from "aws-cdk-lib";
import {
  Construct
} from "constructs";
import { SOLUTION } from "./constant";
import {
  createS3SinkBucket
} from "./s3";
import { createMonitorSns } from "./sns";

import {
  createVPC
} from "./vpc";

export class VPCStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const featureName = "Vpc";
    this.templateOptions.description = `(${SOLUTION.SOLUTION_ID}) ${SOLUTION.SOLUTION_NAME} - ${featureName} (Version ${SOLUTION.SOLUTION_VERSION})`;

    const vpc = createVPC(this, {
      cidr: "10.10.0.0/16",
      createS3Endpoint: true,
    });
    const publicSubnetIds = vpc
      .selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC,
      })
      .subnetIds.join(",");

    const privateSubnetIds = vpc
      .selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      })
      .subnetIds.join(",");

    const vpcParam = new ssm.StringParameter(this, "vpcIdParam", {
      description: "click stream vpc id",
      parameterName: `/${cdk.Stack.of(this).stackName}/vpcId`,
      stringValue: vpc.vpcId,
    });

    new cdk.CfnOutput(this, "vpcId", {
      value: vpc.vpcId,
    });

    new cdk.CfnOutput(this, "vpcIdParameterName", {
      value: vpcParam.parameterName,
    });

    new cdk.CfnOutput(this, "PublicSubnetIds", {
      value: publicSubnetIds,
    });

    new cdk.CfnOutput(this, "PrivateSubnetWithEgressIds", {
      value: privateSubnetIds,
    });
  }
}


export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const featureName = "Infra";
    this.templateOptions.description = `(${SOLUTION.SOLUTION_ID}) ${SOLUTION.SOLUTION_NAME} - ${featureName} (Version ${SOLUTION.SOLUTION_VERSION})`;

    const s3Bucket = createS3SinkBucket(this, "s3-bucket");
    const snsTopic = createMonitorSns(this);


    const s3BucketParam = new ssm.StringParameter(this, "s3BucketParam", {
      description: "S3 Bucket Name",
      parameterName: `/${cdk.Stack.of(this).stackName}/bucketName`,
      stringValue: s3Bucket.bucketName,
    });

    const snsTopicArnParam = new ssm.StringParameter(this, "snsTopicArnParam", {
      description: "SNS Topic Arn",
      parameterName: `/${cdk.Stack.of(this).stackName}/snsTopicArn`,
      stringValue: snsTopic.topicArn,
    });

    new cdk.CfnOutput(this, "bucketName", {
      value: s3Bucket.bucketName,
    });

    new cdk.CfnOutput(this, "bucketNameParameterName", {
      value: s3BucketParam.parameterName,
    });

    new cdk.CfnOutput(this, "snsTopicArn", {
      value: snsTopic.topicArn,
    });

    new cdk.CfnOutput(this, "snsTopicArnParameterName", {
      value: snsTopicArnParam.parameterName
    });

  }
}