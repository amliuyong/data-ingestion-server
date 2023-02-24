import * as cdk from "aws-cdk-lib";
import { aws_ssm as ssm, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { createKDStream } from "./kinesis";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import { S3SinkConfig, TierType } from "./stack-main";
import { AppConfig } from "./config";
import { getExistingBucketName } from "./util";
import { SOLUTION } from "./constant";
import { setUpVpc } from "./vpc";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { KinesisAndS3SinkConstruct } from "./construct-kinesis";
import { addTags } from "./tags";
import { createTagsParameters } from "./parameter";

export interface KinesisProps extends cdk.StackProps {
  vpcId?: string;
  vpcIdParameterName?: string;
  profile: {
    tier: TierType;
  };
  kinesisConfig: {
    createDeliverLambdaToS3: boolean;
    createKinesisVpcEndpoint: boolean;
  };
  s3Config?: {
    bucketName?: string;
    bucketNameParameterName?: string;
    prefix?: string;
  };
}
export class KinesisStack extends cdk.Stack {
  public streamName: string;
  public kinesisStream: kinesis.Stream;

  constructor(scope: Construct, id: string, props: KinesisProps) {
    super(scope, id, props);

    const tagParameters = createTagsParameters(this);

    let vpc = setUpVpc(this, props);
    const config = new AppConfig(this, props.profile);

    const featureName = "Kinesis";
    this.templateOptions.description = `(${SOLUTION.SOLUTION_ID}) ${SOLUTION.SOLUTION_NAME} - ${featureName} (Version ${SOLUTION.SOLUTION_VERSION})`;

    if (props.kinesisConfig.createDeliverLambdaToS3 && !props.s3Config) {
      throw new Error("s3Config is not set");
    }

    let s3Config: S3SinkConfig | undefined = undefined;
    if (props.s3Config) {
      s3Config = {
        bucketName: getExistingBucketName(this, props.s3Config),
        prefix: props.s3Config?.prefix || this.stackName,
      };
    }

    const kinesisAndS3SinkConstruct = new KinesisAndS3SinkConstruct(
      this,
      "kinesisAndS3SinkConstruct",
      {
        vpc,
        s3Config: s3Config,
        createDeliverLambdaToS3: props.kinesisConfig.createDeliverLambdaToS3,
        kinesisSetting: config.getKinesisSetting(),
      }
    );

    addTags(kinesisAndS3SinkConstruct, tagParameters);

    if (props.kinesisConfig.createKinesisVpcEndpoint) {
      vpc.addInterfaceEndpoint("kinesis-vpc-endpoint", {
        service: ec2.InterfaceVpcEndpointAwsService.KINESIS_STREAMS,
      });
    }

    const kinesisStreamNameParam = new ssm.StringParameter(
      this,
      "streamNameParameter",
      {
        description: "Kinesis Stream Name",
        parameterName: `/${cdk.Stack.of(this).stackName}/streamName`,
        stringValue: kinesisAndS3SinkConstruct.streamName,
      }
    );

    new cdk.CfnOutput(this, "streamNameParam", {
      value: kinesisStreamNameParam.parameterName,
    });

    new cdk.CfnOutput(this, "KinesisStream", {
      value: kinesisAndS3SinkConstruct.kinesisStream.streamArn,
    });

    if (s3Config) {
      new cdk.CfnOutput(this, "SinkS3BucketName", {
        value: s3Config.bucketName,
      });

      new cdk.CfnOutput(this, "SinkS3Prefix", {
        value: s3Config.prefix,
      });
    }
    this.streamName = kinesisAndS3SinkConstruct.streamName;
    this.kinesisStream = kinesisAndS3SinkConstruct.kinesisStream;
  }
}
