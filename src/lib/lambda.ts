import {
  aws_lambda as lambda,
  aws_s3 as s3,
  aws_ec2 as ec2,
  aws_iam as iam,
  Duration,
} from "aws-cdk-lib";
import * as path from "path";

import * as lambda_python from "@aws-cdk/aws-lambda-python-alpha";

import { Construct } from "constructs";
import {
  addPoliciesToCrCreateS3SinkConnectorLambda,
  addPoliciesToCrDeleteClusterLambda,
  addPoliciesToCrGetMskConfigVersionLambda,
  grantCloudWatchRead,
} from "./iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { getServiceSubnets } from "./vpc";
import { S3SinkConnectorSetting } from "./construct-msk";
import { createKinesisToS3LambdaSecurityGroup } from "./sg";
import { createAlbLoginLambdaImage } from "./ecr";
import { OIDCProvider } from "./cognito";

export interface CrMskS3SinkConnectorLambdaProps {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  mskSecurityGroup: ec2.ISecurityGroup;
  pluginS3Bucket: s3.IBucket;
  sinkS3Bucket: s3.IBucket;
  sinkS3Prefix: string;
  mskTopic: string;
  brokersString: string;
  s3SinkConnectorRole: iam.Role;
  mskClusterName: string;
  s3SinkConnectorSetting: S3SinkConnectorSetting;
  createS3SinkConnector: boolean;
}


export function createCrMskS3SinkConnectorLambda(
  scope: Construct,
  props: CrMskS3SinkConnectorLambdaProps
): { fn: lambda.Function; policy?: iam.Policy } {
  const s3SinkConnectorSetting = props.s3SinkConnectorSetting;

  const vpc = props.vpc;
  const { selectedSubnets } = getServiceSubnets(vpc, "lambda.Function");

  const fn = new lambda_python.PythonFunction(
    scope,
    "cr-create-msk-s3-sink-connector-lambda",
    {
      runtime: lambda.Runtime.PYTHON_3_9,
      entry:  path.join(__dirname, "./lambda/cr/create-msk-s3-sink-connector/"),
      index: "app.py",
      memorySize: 512,
      timeout: Duration.minutes(15),
      logRetention: RetentionDays.ONE_WEEK,
      securityGroups: [props.lambdaSecurityGroup],
      //allowPublicSubnet: publicSubnet,
      environment: {
        MSK_PLUGIN_S3_BUCKET: props.pluginS3Bucket.bucketName,
        MSK_SINK_S3_BUCKET: props.sinkS3Bucket.bucketName,
        MSK_SINK_S3_PREFIX: props.sinkS3Prefix,
        MSK_TOPIC: props.mskTopic,
        MSK_BROKERS: props.brokersString,
        MSK_CONNECTOR_ROLE_ARN: props.s3SinkConnectorRole.roleArn,
        MSK_SECURITY_GROUP_ID: props.mskSecurityGroup.securityGroupId,
        MSK_CLUSTER_NAME: props.mskClusterName,
        MSK_S3_CONNECTOR_WORKER_COUNT_MAX: `${s3SinkConnectorSetting.maxWorkerCount}`,
        MSK_S3_CONNECTOR_WORKER_COUNT_MIN: `${s3SinkConnectorSetting.minWorkerCount}`,
        MSK_S3_CONNECTOR_MCU_COUNT: `${s3SinkConnectorSetting.workerMcuCount}`,
        MSK_SUBNET_IDS: vpc.selectSubnets(selectedSubnets).subnetIds.join(","),
      },
    }
  );
  props.pluginS3Bucket.grantReadWrite(fn);
  let policy;
  if (fn.role) {
    props.s3SinkConnectorRole.grantPassRole(fn.role);
    policy = addPoliciesToCrCreateS3SinkConnectorLambda(
      scope,
      fn.role,
      props.mskClusterName,
      props.sinkS3Bucket.bucketName
    );
  }
  return { fn, policy };
}


export interface CrMskTopicLambdaProps {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  mskTopic: string;
  mskTopicPartitionCountStringValue: string;
  brokersString: string;
}

export function createCrMskTopicLambda(
  scope: Construct,
  props: CrMskTopicLambdaProps
): lambda.Function {
  const vpc = props.vpc;
  const { selectedSubnets, publicSubnet } = getServiceSubnets(
    vpc,
    "lambda.Function"
  );
  const fn = new lambda_python.PythonFunction(scope, "cr-create-msk-topic-lambda", {
    runtime: lambda.Runtime.PYTHON_3_9,
    entry:  path.join(__dirname, "./lambda/cr/create-msk-topic/"),
    index: "app.py",
    memorySize: 512,
    timeout: Duration.minutes(1),
    logRetention: RetentionDays.ONE_WEEK,
    vpc,
    vpcSubnets: selectedSubnets,
    securityGroups: [props.lambdaSecurityGroup],
    allowPublicSubnet: publicSubnet,
    environment: {
      MSK_TOPIC: props.mskTopic,
      MSK_BROKERS: props.brokersString,
      MSK_TOPIC_PARTITIONS: props.mskTopicPartitionCountStringValue,
    },
  });
  return fn;
}

export interface CrGetMskConfigVersionLambdaProps {
  configArn: string;
  configName: string;
}
export function createCrGetMskConfigVersionLambda(
  scope: Construct,
  props: CrGetMskConfigVersionLambdaProps
): lambda.Function {
  const fn = new lambda.Function(scope, "cr-get-msk-config-version", {
    runtime: lambda.Runtime.PYTHON_3_9,
    code: lambda.Code.fromAsset(
      path.join(__dirname, "./lambda/cr/get-msk-config-version/")
    ),
    handler: "app.handler",
    memorySize: 512,
    timeout: Duration.minutes(1),
    logRetention: RetentionDays.ONE_WEEK,
    environment: {
      MSK_CONFIG_ARN: props.configArn,
    },
  });

  if (fn.role) {
    addPoliciesToCrGetMskConfigVersionLambda(scope, fn.role, props.configName);
  }
  return fn;
}

export interface CrDeleteClusterLambdaProps {
  clusterName: string;
  service: string;
  taskName: string;
  asgName: string;
}

export function createCrDeleteClusterLambda(
  scope: Construct,
  props: CrDeleteClusterLambdaProps
): { fn: lambda.Function; policy?: iam.Policy } {
  const fn = new lambda.Function(scope, "cr-delete-ecs-cluster", {
    runtime: lambda.Runtime.PYTHON_3_9,
    code: lambda.Code.fromAsset(
      path.join(__dirname, "./lambda/cr/delete-ecs-cluster/")
    ),
    handler: "app.handler",
    memorySize: 512,
    timeout: Duration.minutes(15),
    logRetention: RetentionDays.ONE_WEEK,
    environment: {
      ECS_CLUSTER_NAME: props.clusterName,
      ECS_SERVICE: props.service,
      ECS_TASK_NAME: props.taskName,
      ASG_NAME: props.asgName,
    },
  });
  let policy;
  if (fn.role) {
    policy = addPoliciesToCrDeleteClusterLambda(scope, fn.role, props);
  }
  return { fn, policy };
}

export interface AlbReceiverLambdaProps {
  mskBrokerString: string;
  mskTopic: string;
  kinesisStreamName: string;
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  lambdaSetting: {
    memorySize: number;
    timeoutSec: number;
  };
}

export function createAlbReceiverLambda(
  scope: Construct,
  props: AlbReceiverLambdaProps
) {
  const vpc = props.vpc;
  const { selectedSubnets, publicSubnet } = getServiceSubnets(
    vpc,
    "lambda.Function"
  );

  const fn = new lambda.Function(scope, "alb-receiver-lambda", {
    runtime: lambda.Runtime.JAVA_11,
    code: lambda.Code.fromAsset(
      path.join(
        __dirname,
        "./lambda/alb-receiver/target/alb-receiver-lambda.zip"
      )
    ),
    handler:
      "com.amazon.aws.gcr.csdc.clickstream.server.ALBReceiverLambda::handleRequest",
    memorySize: props.lambdaSetting.memorySize,
    timeout: Duration.seconds(props.lambdaSetting.timeoutSec),
    logRetention: RetentionDays.ONE_WEEK,
    vpc,
    vpcSubnets: selectedSubnets,
    securityGroups: [props.lambdaSecurityGroup],
    allowPublicSubnet: publicSubnet,
    environment: {
      JAVA_TOOL_OPTIONS: "-XX:+TieredCompilation -XX:TieredStopAtLevel=1",
      AWS_KINESIS_STREAM_NAME: props.kinesisStreamName,
      AWS_MSK_BROKERS: props.mskBrokerString,
      AWS_MSK_TOPIC: props.mskTopic,
    },
  });
  return fn;
}

export interface KinesisToS3Lambda {
  vpc: ec2.IVpc;
  s3Bucket: string;
  prefix: string;
}

export function createKinesisToS3Lambda(
  scope: Construct,
  props: KinesisToS3Lambda
): lambda.Function {
  const vpc = props.vpc;
  const lambdaSecurityGroup = createKinesisToS3LambdaSecurityGroup(scope, vpc);
  const { selectedSubnets, publicSubnet } = getServiceSubnets(
    vpc,
    "lambda.Function"
  );
  const fn = new lambda.Function(scope, "kinesis-to-s3-lambda", {
    runtime: lambda.Runtime.PYTHON_3_9,
    code: lambda.Code.fromAsset(
      path.join(__dirname, "./lambda/kinesis-to-s3/")
    ),
    handler: "app.handler",
    memorySize: 2048,
    timeout: Duration.minutes(15),
    logRetention: RetentionDays.ONE_WEEK,
    vpc,
    vpcSubnets: selectedSubnets,
    securityGroups: [lambdaSecurityGroup],
    allowPublicSubnet: publicSubnet,
    environment: {
      AWS_S3_BUCKET: props.s3Bucket,
      AWS_S3_PREFIX: props.prefix,
    },
  });
  return fn;
}

export function createServerHealthCheckLambda(
  scope: Construct,
  snsArn: string
): lambda.Function {
  const fn = new lambda.Function(scope, "ServerHealthCheckLambda", {
    runtime: lambda.Runtime.PYTHON_3_9,
    code: lambda.Code.fromAsset(path.join(__dirname, "./lambda/health-check/")),
    handler: "app.handler",
    memorySize: 256,
    timeout: Duration.minutes(2),
    logRetention: RetentionDays.ONE_WEEK,
    environment: {
      SNS_TOPIC_ARN: snsArn,
    },
  });

  return fn;
}

export interface AlbLoginLambdaProps {
  loginUrl: string;
  oidcProvider: OIDCProvider;
}

export function createAlbLoginLambda(
  scope: Construct,
  props: AlbLoginLambdaProps
): lambda.Function {
  const code = createAlbLoginLambdaImage(scope);
  return new lambda.DockerImageFunction(scope, "AlbLoginLambda", {
    code,
    memorySize: 1024,
    timeout: Duration.seconds(60),
    environment: {
      SERVER_URL: props.loginUrl,
      OIDC_PROVIDER: props.oidcProvider,
    },
  });
}

export interface MetricLambdaPros {
  albFullName: string;
  asgName?: string;
  ecsClusterName?: string;
  ecsServiceName?: string;
  targetGroupArn?: string;
}

export function createMetricLambda(
  scope: Construct,
  props: MetricLambdaPros
): lambda.Function {
  const albFullNameEnv = {
    LOAD_BALANCER_FULL_NAME: props.albFullName,
  };

  let asgNameEnv = {};
  if (props.asgName) {
    asgNameEnv = {
      AUTO_SCALING_GROUP_NAME: props.asgName,
    };
  }

  let ecsClusterNameEnv = {};
  if (props.ecsClusterName) {
    ecsClusterNameEnv = {
      ECS_CLUSTER_NAME: props.ecsClusterName,
    };
  }

  let ecsServiceNameEnv = {};
  if (props.ecsServiceName) {
    ecsServiceNameEnv = {
      ECS_SERVICE_NAME: props.ecsServiceName,
    };
  }

  let targetGroupArnEnv = {};
  if (props.targetGroupArn) {
    targetGroupArnEnv = {
      TARGET_GROUP_ARN: props.targetGroupArn,
    };
  }

  const environment = {
    ...albFullNameEnv,
    ...asgNameEnv,
    ...ecsClusterNameEnv,
    ...ecsServiceNameEnv,
    ...targetGroupArnEnv,
  };

  const fn = new lambda.Function(scope, "MetricLambda", {
    runtime: lambda.Runtime.PYTHON_3_9,
    code: lambda.Code.fromAsset(path.join(__dirname, "./lambda/metric/")),
    handler: "app.handler",
    memorySize: 1024,
    timeout: Duration.seconds(30),
    logRetention: RetentionDays.ONE_WEEK,
    environment,
  });
  if (fn.role) {
    grantCloudWatchRead(scope, fn.role);
  }
  return fn;
}
