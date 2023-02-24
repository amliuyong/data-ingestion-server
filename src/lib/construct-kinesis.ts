import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createKDStream, KinesisSetting } from "./kinesis";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { S3SinkConfig } from "./stack-main";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import { createKinesisToS3Lambda } from "./lambda";
import { KinesisEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export interface Props {
  s3Config?: S3SinkConfig;
  vpc: IVpc;
  createDeliverLambdaToS3: boolean;
  kinesisSetting: KinesisSetting;
}

export class KinesisAndS3SinkConstruct extends Construct {
  public streamName: string;
  public kinesisStream: kinesis.Stream;
  public kinesisToS3Lambda?: lambda.Function;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    if (props.createDeliverLambdaToS3 && !props.s3Config) {
      throw new Error("s3Config is not set");
    }

    const kinesisDataStream = createKDStream(this, {
      createDeliverLambdaToS3: props.createDeliverLambdaToS3,
      s3Config: props.s3Config,
      vpc: props.vpc,
      kinesisSetting: props.kinesisSetting,
    });

    if (props.createDeliverLambdaToS3) {
      if (!props.s3Config) {
        throw new Error("s3Config is not set");
      }
      const s3Bucket = s3.Bucket.fromBucketName(
        scope,
        "s3-kinesis-sink-bucket",
        props.s3Config.bucketName
      );

      const kinesisToS3Lambda = createKinesisToS3Lambda(scope, {
        vpc: props.vpc,
        s3Bucket: props.s3Config.bucketName,
        prefix: props.s3Config.prefix,
      });

      s3Bucket.grantReadWrite(kinesisToS3Lambda);
      this.kinesisToS3Lambda = kinesisToS3Lambda;
      kinesisDataStream.grantReadWrite(kinesisToS3Lambda);

      kinesisToS3Lambda.addEventSource(
        new KinesisEventSource(kinesisDataStream, {
          enabled: true,
          maxBatchingWindow: cdk.Duration.minutes(5),
          batchSize: props.kinesisSetting?.lambdaBatchSize
            ? props.kinesisSetting.lambdaBatchSize
            : 10000,
          bisectBatchOnError: true,
          startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        })
      );
    }

    new cdk.CfnOutput(this, "KinesisStream", {
      value: kinesisDataStream.streamArn,
    });

    this.streamName = kinesisDataStream.streamName;
    this.kinesisStream = kinesisDataStream;
  }
}
