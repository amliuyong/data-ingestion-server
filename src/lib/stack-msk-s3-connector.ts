import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import {
  TierType,
} from "./stack-main";
import { AppConfig } from "./config";
import { getExistingBucketName, getExistingMskConfig } from "./util";
import { MSKS3SinkConnectorConstruct } from "./construct-msk-s3-connector";
import { setUpVpc } from "./vpc";
import { SOLUTION } from "./constant";
import { createTagsParameters } from "./parameter";
import { addTags } from "./tags";

export interface Props extends cdk.StackProps {
  vpcId?: string;
  vpcIdParameterName?: string;
  profile: {
    tier: TierType;
  };
  mskConfig: {
    mskBrokers?: string;
    mskBrokersParameterName?: string;
    mskTopic?: string;
    mskTopicParameterName?: string;
    mskSecurityGroupId?: string;
    mskSecurityGroupIdParameterName?: string;
    mskClusterName?: string;
    mskClusterNameParameterName?: string;
  };
  s3Config: {
    bucketName?: string;
    bucketNameParameterName?: string;
    prefix?: string;
  };
}
export class MskS3ConnectorStack extends cdk.Stack {
  public streamName: string;
  public kinesisStream: kinesis.Stream;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const config = new AppConfig(this, props.profile);

    const featureName = "S3SinkConnector";
    this.templateOptions.description = `(${SOLUTION.SOLUTION_ID}) ${SOLUTION.SOLUTION_NAME} - ${featureName} (Version ${SOLUTION.SOLUTION_VERSION})`;

    const tagParameters = createTagsParameters(this);

    const vpc = setUpVpc(this, props);

    const s3Config = {
      bucketName: getExistingBucketName(this, props.s3Config),
      prefix: props.s3Config?.prefix || `${this.stackName}-topics`,
    };

    const mskConfig = getExistingMskConfig(this, props.mskConfig);

    const s3SinkConnectorSetting = config.getMskSinkConnectorSetting()

    const mskS3SinkConnectorConstruct = new MSKS3SinkConnectorConstruct(this, "s3-sink-conn", {
      vpc,
      s3SinkConfig: s3Config,
      mskTopic: mskConfig.mskTopic,
      clusterName: mskConfig.mskClusterName,
      mskBrokers: mskConfig.mskBrokers,
      mskSecurityGroup: mskConfig.mskSecurityGroup,
      s3SinkConnectorSetting,
    });

    addTags(mskS3SinkConnectorConstruct, tagParameters);

    new cdk.CfnOutput(this, "SinkS3BucketName", {
      value: s3Config.bucketName,
    });

    new cdk.CfnOutput(this, "SinkS3Prefix", {
      value: s3Config.prefix,
    });

  }
}
