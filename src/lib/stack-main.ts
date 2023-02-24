import * as cdk from "aws-cdk-lib";
import { aws_ec2 as ec2, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import { AppConfig } from "./config";
import {
  IngestServerConstruct,
  ServerAuthentication,
} from "./consturct-ingest-server";
import { fromProvidedBucket } from "./s3";

import { setUpVpc } from "./vpc";
import {
  getExistingMskConfig,
  getExistingStreamName,
  getSnsTopicArn,
} from "./util";
import { grantMskReadWrite, grantKinesisStreamReadWrite } from "./iam";
import { SOLUTION } from "./constant";
import { createTagsParameters } from "./parameter";
import { addTags } from "./tags";
import { IngestLambdaServerConstruct } from "./consturct-ingest-lambda-server";
import { getHostedZone } from "./route53";

export enum TierType {
  XSMALL = "XSMALL",
  SMALL = "SMALL",
  MEDIUM = "MEDIUM",
  LARGE = "LARGE",
}

export interface MskSinkConfig {
  mskBrokers: string;
  mskTopic: string;
  mskSecurityGroup?: ec2.ISecurityGroup;
  mskClusterName: string;
}

export interface S3SinkConfig {
  bucketName: string;
  prefix: string;
}

export interface KinesisSinkConfig {
  streamName: string;
}

export enum ServiceType {
  ECS_EC2_NGINX_LUA = "ECS_EC2_NGINX_LUA",
  ECS_EC2_NGINX_VECTOR = "ECS_EC2_NGINX_VECTOR",
  ECS_EC2_NGINX_LOG = "ECS_EC2_NGINX_LOG",
  ECS_EC2_JAVA_SERVER = "ECS_EC2_JAVA_SERVER",
  ECS_FARGATE_NGINX_VECTOR = "ECS_FARGATE_NGINX_VECTOR",
  LAMBDA = "LAMBDA",
}

export interface ServerIngestionStackProps extends cdk.StackProps {
  profile: {
    tier: TierType;
    deliverToKinesis?: boolean;
    deliverToMSK?: boolean;
    deliverToS3?: boolean;
    serviceType?: ServiceType;
  };
  vpcId?: string;
  vpcIdParameterName?: string;
  hostedZoneId?: string;
  hostedZoneName?: string;
  adminEmail?: string;
  serverAuth?: ServerAuthentication;
  snsTopicArn?: string;
  snsTopicArnParameterName?: string;
  s3Config?: {
    bucketName?: string;
    bucketNameParameterName?: string;
    prefix?: string;
  };
  kinesisConfig?: {
    streamName?: string;
    streamNameParameterName?: string;
  };
  mskConfig?: {
    mskBrokers?: string;
    mskTopic?: string;
    mskClusterName?: string;
    mskBrokersParameterName?: string;
    mskTopicParameterName?: string;
    mskSecurityGroupId?: string;
    mskSecurityGroupIdParameterName?: string;
    mskClusterNameParameterName?: string;
  };
}
export class ServerIngestionStack extends cdk.Stack {
  private config: AppConfig;

  constructor(scope: Construct, id: string, props: ServerIngestionStackProps) {
    super(scope, id, props);
    props = {
      ...props,
    };

    this.config = new AppConfig(this, props.profile);
    this.templateOptions.description = `(${SOLUTION.SOLUTION_ID}) ${SOLUTION.SOLUTION_NAME} (Version ${SOLUTION.SOLUTION_VERSION})`;

    validate(props);

    const tagParameters = createTagsParameters(this);

    // VPC
    const vpc = setUpVpc(this, props);

    let kinesisConfig: KinesisSinkConfig | undefined = undefined;
    let mskConfig: MskSinkConfig | undefined = undefined;
    let s3Config: S3SinkConfig | undefined = undefined;

    // deliverToS3
    let s3Bucket = undefined;
    if (
      props.profile?.deliverToS3 ||
      props.profile.serviceType == ServiceType.ECS_EC2_NGINX_LOG
    ) {
      if (!props.s3Config) {
        throw new Error("s3Config is not set, deliverToS3=true");
      }
      s3Bucket = fromProvidedBucket(this, props.s3Config);
      s3Config = {
        bucketName: s3Bucket.bucketName,
        prefix: props.s3Config?.prefix || `${this.stackName}`,
      };
    }

    // deliverToMsk
    if (props.profile?.deliverToMSK) {
      if (!props.mskConfig) {
        throw new Error("mskConfig is not set");
      }
      mskConfig = getExistingMskConfig(this, props.mskConfig);
    }

    // deliverToKinesis
    if (props.profile?.deliverToKinesis) {
      if (!props.kinesisConfig) {
        throw new Error("kinesisConfig is not set");
      }
      kinesisConfig = {
        streamName: getExistingStreamName(this, props.kinesisConfig),
      };
    }
    const snsTopicArn = getSnsTopicArn(
      this,
      props.snsTopicArn,
      props.snsTopicArnParameterName
    );

    // Ingestion Server
    let ingestServer;
    let taskRole;
    let hostedZone;

    if (props.hostedZoneId && props.hostedZoneName) {
      hostedZone = getHostedZone(
        this,
        props.hostedZoneId,
        props.hostedZoneName
      );
    }

    if (props.profile.serviceType == ServiceType.LAMBDA) {
      // Lambda service
      ingestServer = new IngestLambdaServerConstruct(
        this,
        "lambda-server-construct",
        {
          vpc,
          mskConfig,
          kinesisConfig,
          hostedZone,
          lambdaSetting: this.config.getLambdaServerSetting(),
          adminEmail: props.adminEmail,
          serverAuth: props.serverAuth,
          snsTopicArn,
        }
      );
      taskRole = ingestServer.lambdaRole;
      new cdk.CfnOutput(this, "lambda", {
        value: ingestServer.lambdaFn.functionName,
        description: "Lambda server function name",
      });
      new cdk.CfnOutput(this, "lambdaSecurityGroupId", {
        value: ingestServer.lambdaSecurityGroup.securityGroupId,
        description: "Lambda server security group Id",
      });
    } else {
      // ECS service
      ingestServer = new IngestServerConstruct(this, "server", {
        vpc,
        ecsServiceType:
          props.profile?.serviceType || ServiceType.ECS_EC2_NGINX_VECTOR,
        ecsFargateSetting: this.config.getEcsFargateSetting(),
        ecsEc2NginxAndVectorAsgSetting:
          this.config.getEcsEc2NginxAndVectorAsgSetting(),
        ecsEc2LuaNginxAsgSetting: this.config.getEcsEc2LuaNginxAsgSetting(),
        ecsEc2NginxLogAsgSetting: this.config.getEcsEc2NginxLogAsgSetting(),
        ecsEc2JavaServerAsgSetting: this.config.getEcsEc2JavaServerAsgSetting(),
        s3Config,
        mskConfig,
        kinesisConfig,
        hostedZone,
        adminEmail: props.adminEmail,
        serverAuth: props.serverAuth,
        snsTopicArn,
      });
      taskRole = ingestServer.escTaskRole;

      new cdk.CfnOutput(this, "ECSCluster", {
        value: ingestServer.cluster.clusterName,
        description: "ECS Cluster Name",
      });

      new cdk.CfnOutput(this, "ECSSecurityGroupId", {
        value: ingestServer.ecsSecurityGroup.securityGroupId,
        description: "ECS Security Group Id",
      });
    }

    addTags(ingestServer, tagParameters);

    if (taskRole) {
      s3Bucket?.grantReadWrite(taskRole);
    }

    if (kinesisConfig && taskRole) {
      grantKinesisStreamReadWrite(this, taskRole, kinesisConfig.streamName);
    }

    if (mskConfig && taskRole) {
      grantMskReadWrite(
        this,
        taskRole,
        mskConfig.mskClusterName,
        "mskClusterAccessPolicy"
      );
    }

    // Output
    new cdk.CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      description: "VpcId",
    });

    new cdk.CfnOutput(this, "albUrl", {
      value: ingestServer.albUrl,
      description: "Alb Url",
    });

    new CfnOutput(this, "ingestionServerUrl", {
      value: ingestServer.serverUrl,
      description: "Ingestion Server Url",
    });

    if (s3Bucket) {
      new cdk.CfnOutput(this, "SinkS3Bucket", {
        value: s3Bucket.bucketName,
        description: "Sink S3 Bucket",
      });
    }
    if (ingestServer.certificateArn) {
      new CfnOutput(this, "certificateArn", {
        value: ingestServer.certificateArn,
        description: "Server Certificate Arn",
      });
    }

    if (ingestServer.loginTokenApiUrl) {
      new CfnOutput(this, "loginTokenApiUrl", {
        value: ingestServer.loginTokenApiUrl,
        description: "Get Login Token Api Url",
      });
    }

    if (ingestServer.metricApiUrl) {
      new CfnOutput(this, "metricApiUrl", {
        value: ingestServer.metricApiUrl,
        description: "Metric Api Url",
      });
    }

    if (mskConfig) {
      new cdk.CfnOutput(this, "MskBootstrapBrokers", {
        value: mskConfig.mskBrokers,
        description: "Msk BootstrapBrokers",
      });

      new cdk.CfnOutput(this, "MskTopic", {
        value: mskConfig.mskTopic,
        description: "Msk Topic",
      });

      new cdk.CfnOutput(this, "MskClusterName", {
        value: mskConfig.mskClusterName,
        description: "Msk ClusterName",
      });
    }

    if (kinesisConfig) {
      new cdk.CfnOutput(this, "KinesisStreamName", {
        value: kinesisConfig.streamName,
        description: "Kinesis Data Stream Name",
      });
    }

    new cdk.CfnOutput(this, "Tier", {
      value: props.profile.tier.toString(),
      description: "Tier",
    });
  }
}

function validate(props: ServerIngestionStackProps) {
  if (
    props.profile.serviceType == ServiceType.ECS_EC2_NGINX_LUA &&
    (props.profile.deliverToKinesis || props.profile.deliverToS3)
  ) {
    throw new Error(
      "Config Error: ecsServiceType: " +
        props.profile.serviceType +
        " only for MSK"
    );
  }
}
