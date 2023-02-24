#!/usr/bin/env node

import * as cdk from "aws-cdk-lib";
import { InfraStack } from "../lib/stack-infra";
import { ServerIngestionStack, ServiceType, TierType } from "../lib/stack-main";
import { MSKStack } from "../lib/stack-msk";
import { VPCStack } from "../lib/stack-infra";
import { KinesisStack } from "../lib/stack-kinesis";
import { MskS3ConnectorStack } from "../lib/stack-msk-s3-connector";
import { HostZone_yonmzn_use1, KeyCloakOidcProps } from "../lib/constant";
import { OIDCProvider } from "../lib/cognito";

const app = new cdk.App();

// ======================= vpc and infra =======================

// Create a VPC
new VPCStack(app, "clickstream-vpc", {});

// Create Infra: S3 bucket
new InfraStack(app, "clickstream-infra", {});

// ======================= MSK cluster =======================

// Create MSK Stack
new MSKStack(app, "cs-msk-small", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// Create MSK S3 sink connector
new MskS3ConnectorStack(app, "cs-msk-s3-sink-small", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
  },
  mskConfig: {
    mskBrokersParameterName: "/cs-msk-small/mskBrokers",
    mskTopicParameterName: "/cs-msk-small/mskTopic",
    mskSecurityGroupIdParameterName: "/cs-msk-small/mskSecurityGroupId",
    mskClusterNameParameterName: "/cs-msk-small/mskClusterName",
  },
  s3Config: {
    bucketNameParameterName: "/clickstream-infra/bucketName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// ======================= Server to MSK =======================

// Server ECS_EC2_NGINX_VECTOR to MSK
new ServerIngestionStack(app, "cs-server-ec2-vector", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  snsTopicArnParameterName: "/clickstream-infra/snsTopicArn",
  adminEmail: "yonmzn@amazon.com",
  profile: {
    tier: TierType.SMALL,
    deliverToMSK: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },

  mskConfig: {
    mskBrokersParameterName: "/cs-msk-small/mskBrokers",
    mskTopicParameterName: "/cs-msk-small/mskTopic",
    mskSecurityGroupIdParameterName: "/cs-msk-small/mskSecurityGroupId",
    mskClusterNameParameterName: "/cs-msk-small/mskClusterName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new ServerIngestionStack(app, "cs-server-ec2-vector-batch", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
    deliverToMSK: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },

  mskConfig: {
    mskBrokersParameterName: "/cs-msk-small/mskBrokers",
    mskTopicParameterName: "/cs-msk-small/mskTopic",
    mskSecurityGroupIdParameterName: "/cs-msk-small/mskSecurityGroupId",
    mskClusterNameParameterName: "/cs-msk-small/mskClusterName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new ServerIngestionStack(app, "cs-server-ec2-java", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
    deliverToMSK: true,
    serviceType: ServiceType.ECS_EC2_JAVA_SERVER,
  },
  mskConfig: {
    mskBrokersParameterName: "/cs-msk-small/mskBrokers",
    mskTopicParameterName: "/cs-msk-small/mskTopic",
    mskSecurityGroupIdParameterName: "/cs-msk-small/mskSecurityGroupId",
    mskClusterNameParameterName: "/cs-msk-small/mskClusterName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// Server EC2_NGINX_VECTOR to MSK with domain
new ServerIngestionStack(app, "cs-server-ec2-https", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  snsTopicArnParameterName: "/clickstream-infra/snsTopicArn",
  adminEmail: "yonmzn@amazon.com",

  hostedZoneId: HostZone_yonmzn_use1.hostedZoneId,
  hostedZoneName: HostZone_yonmzn_use1.zoneName,
  
  profile: {
    tier: TierType.SMALL,
    deliverToMSK: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },

  mskConfig: {
    mskBrokersParameterName: "/cs-msk-small/mskBrokers",
    mskTopicParameterName: "/cs-msk-small/mskTopic",
    mskSecurityGroupIdParameterName: "/cs-msk-small/mskSecurityGroupId",
    mskClusterNameParameterName: "/cs-msk-small/mskClusterName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});


// Server EC2_NGINX_VECTOR to MSK with auth - cognito
new ServerIngestionStack(app, "cs-server-ec2-auth-cognito", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  snsTopicArnParameterName: "/clickstream-infra/snsTopicArn",
  adminEmail: "yonmzn@amazon.com",

  hostedZoneId: HostZone_yonmzn_use1.hostedZoneId,
  hostedZoneName: HostZone_yonmzn_use1.zoneName,
  
  profile: {
    tier: TierType.SMALL,
    deliverToMSK: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },

  serverAuth: {
    oidcProvider: OIDCProvider.COGNITO_CREATE_NEW,
  },

  mskConfig: {
    mskBrokersParameterName: "/cs-msk-small/mskBrokers",
    mskTopicParameterName: "/cs-msk-small/mskTopic",
    mskSecurityGroupIdParameterName: "/cs-msk-small/mskSecurityGroupId",
    mskClusterNameParameterName: "/cs-msk-small/mskClusterName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});


new ServerIngestionStack(app, "cs-server-ec2-auth-keycloak", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  snsTopicArnParameterName: "/clickstream-infra/snsTopicArn",
  adminEmail: "yonmzn@amazon.com",

  hostedZoneId: HostZone_yonmzn_use1.hostedZoneId,
  hostedZoneName: HostZone_yonmzn_use1.zoneName,
  
  profile: {
    tier: TierType.SMALL,
    deliverToMSK: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },
  serverAuth: {
    oidcProvider: OIDCProvider.KEYCLOAK,
    oidcProps: KeyCloakOidcProps
  },

  mskConfig: {
    mskBrokersParameterName: "/cs-msk-small/mskBrokers",
    mskTopicParameterName: "/cs-msk-small/mskTopic",
    mskSecurityGroupIdParameterName: "/cs-msk-small/mskSecurityGroupId",
    mskClusterNameParameterName: "/cs-msk-small/mskClusterName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// Server EC2_NGINX_LUA to MSK
new ServerIngestionStack(app, "cs-server-lua", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
    deliverToMSK: true,
    serviceType: ServiceType.ECS_EC2_NGINX_LUA,
  },
  mskConfig: {
    mskBrokersParameterName: "/cs-msk-small/mskBrokers",
    mskTopicParameterName: "/cs-msk-small/mskTopic",
    mskSecurityGroupIdParameterName: "/cs-msk-small/mskSecurityGroupId",
    mskClusterNameParameterName: "/cs-msk-small/mskClusterName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// ======================= Server to S3 =======================

// Server EC2_NGINX_LUA to S3
new ServerIngestionStack(app, "cs-server-s3-vector", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
    deliverToS3: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },
  s3Config: {
    bucketNameParameterName: "/clickstream-infra/bucketName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new ServerIngestionStack(app, "cs-server-ec2-nginx-log-ebs", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
    deliverToS3: true,
    serviceType: ServiceType.ECS_EC2_NGINX_LOG,
  },
  s3Config: {
    bucketNameParameterName: "/clickstream-infra/bucketName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new ServerIngestionStack(app, "cs-server-ec2-nginx-log-efs", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
    deliverToS3: true,
    serviceType: ServiceType.ECS_EC2_NGINX_LOG,
  },
  s3Config: {
    bucketNameParameterName: "/clickstream-infra/bucketName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// ======================= Kinesis Stream  =======================

// Create Kinesis Stack
new KinesisStack(app, "cs-kinesis-small", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
  },
  kinesisConfig: {
    createDeliverLambdaToS3: true,
    createKinesisVpcEndpoint: true,
  },
  s3Config: {
    bucketNameParameterName: "/clickstream-infra/bucketName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// =======================  Server to Kinesis Stream =======================

// Server EC2_NGINX_VECTOR to kinesis

new ServerIngestionStack(app, "cs-srv-kinesis-ec2-vector", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  snsTopicArnParameterName: "/clickstream-infra/snsTopicArn",
  adminEmail: "yonmzn@amazon.com",
  profile: {
    tier: TierType.SMALL,
    deliverToKinesis: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },
  kinesisConfig: {
    streamNameParameterName: "/cs-kinesis-small/streamName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new ServerIngestionStack(app, "cs-srv-kinesis-vector-batch", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  snsTopicArnParameterName: "/clickstream-infra/snsTopicArn",
  adminEmail: "yonmzn@amazon.com",
  profile: {
    tier: TierType.SMALL,
    deliverToKinesis: true,
    serviceType: ServiceType.ECS_EC2_NGINX_VECTOR,
  },
  kinesisConfig: {
    streamNameParameterName: "/cs-kinesis-small/streamName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new ServerIngestionStack(app, "cs-server-ec2-java-kinesis", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  profile: {
    tier: TierType.SMALL,
    deliverToKinesis: true,
    serviceType: ServiceType.ECS_EC2_JAVA_SERVER,
  },
  kinesisConfig: {
    streamNameParameterName: "/cs-kinesis-small/streamName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new ServerIngestionStack(app, "cs-lambda-kinesis-auth-cognito", {
  vpcIdParameterName: "/clickstream-vpc/vpcId",
  snsTopicArnParameterName: "/clickstream-infra/snsTopicArn",
  hostedZoneId: HostZone_yonmzn_use1.hostedZoneId,
  hostedZoneName: HostZone_yonmzn_use1.zoneName,
  adminEmail: "yonmzn@amazon.com",
  serverAuth: {
    oidcProvider: OIDCProvider.COGNITO_CREATE_NEW,
  },
  
  profile: {
    tier: TierType.SMALL,
    deliverToKinesis: true,
    serviceType: ServiceType.LAMBDA,
  },

  kinesisConfig: {
    streamNameParameterName: "/cs-kinesis-small/streamName",
  },
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
