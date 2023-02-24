import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";

import { Construct } from "constructs";
import { createMSKPluginResourceBucket } from "./s3";
import {
  createMskCustomResourceLambdaSecurityGroup,
} from "./sg";
import { createS3SinkConnectorRole } from "./iam";
import {
  createS3SinkConnectorCustomResource,
} from "./custom-resource";
import { S3SinkConfig } from "./stack-main";

export interface MSKSetting {
  topicPartitionCount: number;
  numberOfBrokerNodesPerAz: number;
  ebsVolumeSize: number;
  instanceSize: ec2.InstanceSize; // kafka.m5.large
  dataRetentionHours: number;
}

export interface S3SinkConnectorSetting {
  maxWorkerCount: number;
  minWorkerCount: number;
  workerMcuCount: number;
}

interface Props {
  vpc: ec2.IVpc;
  s3SinkConfig: S3SinkConfig;
  mskTopic: string;
  clusterName: string;
  mskBrokers: string;
  mskSecurityGroup: ec2.ISecurityGroup;
  s3SinkConnectorSetting: S3SinkConnectorSetting;
}

export class MSKS3SinkConnectorConstruct extends Construct {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);
    this.createS3Sink(scope, props);
  }

  private createS3Sink(scope: Construct, props: Props) {
    const mskSecurityGroup = props.mskSecurityGroup;

    const mskCustomResourceLambdaSecurityGroup =
      createMskCustomResourceLambdaSecurityGroup(
        this,
        props.vpc,
        mskSecurityGroup
      );

    const { role: s3SinkConnectorRole, policy } = createS3SinkConnectorRole(
      this,
      props.clusterName,
      props.s3SinkConfig.bucketName
    );
    const sinkS3Bucket = s3.Bucket.fromBucketName(
      scope,
      "s3-connector-sink-bucket",
      props.s3SinkConfig.bucketName
    );
    sinkS3Bucket?.grantReadWrite(s3SinkConnectorRole);

    const mskPluginBucket = createMSKPluginResourceBucket(this);
    const s3SinkConnectorSetting = props.s3SinkConnectorSetting;

    const sinkCr = createS3SinkConnectorCustomResource(this, {
      vpc: props.vpc,
      lambdaSecurityGroup: mskCustomResourceLambdaSecurityGroup,
      mskSecurityGroup,
      pluginS3Bucket: mskPluginBucket,
      sinkS3Bucket: sinkS3Bucket,
      sinkS3Prefix: props.s3SinkConfig.prefix,
      mskTopic: props.mskTopic,
      brokersString: props.mskBrokers,
      s3SinkConnectorRole,
      mskClusterName: props.clusterName,
      s3SinkConnectorSetting,
      createS3SinkConnector: true,
    });
    sinkCr.node.addDependency(mskSecurityGroup);

    new cdk.CfnOutput(this, "MskSinkS3Bucket", {
      value: sinkS3Bucket.bucketName,
    });
  }
}
