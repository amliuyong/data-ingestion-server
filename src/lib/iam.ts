import { Aws } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { CrDeleteClusterLambdaProps, MetricLambdaPros } from "./lambda";

export function addPoliciesToAsgRole(
  scope: Construct,
  role: iam.IRole
): iam.IRole {
  role.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
  );
  return role;
}

export function grantMskReadWrite(
  scope: Construct,
  role: iam.IRole,
  mskClusterName: string,
  policyId: string
) {
  const policy = new iam.Policy(scope, policyId);
  addAccessMskPolicies(mskClusterName, policy);
  role.attachInlinePolicy(policy);
}

// export function addMskPoliciesToECSTaskRole(
//   scope: Construct,
//   role: iam.IRole,
//   mskClusterName: string
// ): iam.IRole {
//   role.addManagedPolicy(
//     iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
//   );
//   if (mskClusterName) {
//     const policy = new iam.Policy(scope, "ecs-task-msk-access-policy");
//     addAccessMskPolicies(mskClusterName, policy);
//     role.attachInlinePolicy(policy);
//   }
//   return role;
// }

export function addListECSTaskRole(
  scope: Construct,
  role: iam.IRole,
  ecsClusterName: string
) {
  const policy = new iam.Policy(scope, "ecs-task-list-task-policy");
  policy.addStatements(
    new iam.PolicyStatement({
      resources: [`*`],
      actions: ["ecs:ListTasks"],
    }),
    new iam.PolicyStatement({
      resources: [`arn:${Aws.PARTITION}:ecs:*:*:task/${ecsClusterName}/*`],
      actions: ["ecs:describeTasks"],
    })
  );
  role.attachInlinePolicy(policy);
  return policy;
}

export function addAccessMskPolicies(
  mskClusterName: string,
  policy: iam.Policy
) {
  policy.addStatements(
    new iam.PolicyStatement({
      resources: [`arn:${Aws.PARTITION}:kafka:*:*:cluster/${mskClusterName}/*`],
      actions: ["kafka-cluster:Connect", "kafka-cluster:DescribeCluster"],
    }),

    new iam.PolicyStatement({
      resources: [`arn:${Aws.PARTITION}:kafka:*:*:topic/${mskClusterName}/*/*`],
      actions: [
        "kafka-cluster:ReadData",
        "kafka-cluster:DescribeTopic",
        "kafka-cluster:CreateTopic",
        "kafka-cluster:WriteData",
      ],
    }),

    new iam.PolicyStatement({
      resources: [`arn:${Aws.PARTITION}:kafka:*:*:group/${mskClusterName}/*/*`],
      actions: ["kafka-cluster:AlterGroup", "kafka-cluster:DescribeGroup"],
    })
  );
}

export function createS3SinkConnectorRole(
  scope: Construct,
  mskClusterName: string,
  s3BucketName?: string
) {
  const role = new iam.Role(scope, "msk-connector-role", {
    assumedBy: new iam.ServicePrincipal("kafkaconnect.amazonaws.com"),
  });

  const policy = new iam.Policy(scope, "msk-connector-policy");
  addAccessMskPolicies(mskClusterName, policy);

  policy.addStatements(
    new iam.PolicyStatement({
      resources: ["*"],
      actions: [
        "logs:ListLogDeliveries",
        "logs:CreateLogDelivery",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup",
      ],
    }),
    new iam.PolicyStatement({
      resources: ["*"],
      actions: [
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses",
      ],
    }),

    new iam.PolicyStatement({
      resources: [`arn:${Aws.PARTITION}:s3:::*`],
      actions: ["s3:ListAllMyBuckets"],
    })
  );
  if (s3BucketName) {
    policy.addStatements(
      new iam.PolicyStatement({
        resources: [`arn:${Aws.PARTITION}:s3:::${s3BucketName}/*`],
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:AbortMultipartUpload",
          "s3:ListMultipartUploadParts",
          "s3:ListBucketMultipartUploads",
        ],
      }),
      new iam.PolicyStatement({
        resources: [`arn:${Aws.PARTITION}:s3:::${s3BucketName}`],
        actions: ["s3:ListBucket", "s3:GetBucketLocation"],
      })
    );
  }
  role.attachInlinePolicy(policy);

  // role.addManagedPolicy(
  //   iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
  // );
  return { role, policy };
}

export function addPoliciesToCrCreateS3SinkConnectorLambda(
  scope: Construct,
  role: iam.IRole,
  clusterName: string,
  logS3BucketName: string
): iam.Policy {
  const policy = new iam.Policy(scope, "msk-connector-create-policy");

  policy.addStatements(
    new iam.PolicyStatement({
      resources: [
        `arn:${Aws.PARTITION}:kafkaconnect:*:*:connector/${clusterName}-s3-sink-connector/*`,
        `arn:${Aws.PARTITION}:kafkaconnect:*:*:custom-plugin/${clusterName}-connector-s3-plugin/*`,
      ],
      actions: [
        "kafkaconnect:DescribeCustomPlugin",
        "kafkaconnect:DescribeConnector",
      ],
    }),
    new iam.PolicyStatement({
      resources: ["*"],
      actions: [
        "kafkaconnect:ListConnectors",
        "kafkaconnect:CreateCustomPlugin",
        "kafkaconnect:CreateConnector",
        "kafkaconnect:DeleteConnector",
        "kafkaconnect:ListCustomPlugins",
        "kafkaconnect:DeleteCustomPlugin",
        "kafkaconnect:UpdateConnector",
      ],
    }),
    new iam.PolicyStatement({
      resources: ["*"],
      actions: [
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses",
      ],
    }),
    new iam.PolicyStatement({
      resources: ["*"],
      actions: [
        "logs:ListLogDeliveries",
        "logs:CreateLogDelivery",
        "logs:CreateLogStream",
        "logs:CreateLogGroup",
        "logs:PutDestinationPolicy",
        "logs:PutDestination",
        "logs:PutLogEvents",
        "logs:DeleteLogDelivery",
        "logs:DeleteLogGroup",
        "logs:DeleteLogStream",
        "logs:DeleteDestination",
        "logs:DeleteRetentionPolicy",
      ],
    })
  );

  policy.addStatements(
    new iam.PolicyStatement({
      resources: [`arn:${Aws.PARTITION}:s3:::${logS3BucketName}`],
      actions: [
        "s3:GetBucketLocation",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:GetBucketPolicy",
      ],
    })
  );

  policy.addStatements(
    new iam.PolicyStatement({
      resources: ["arn:${Aws.PARTITION}:iam::*:role/aws-service-role/*"],
      actions: [
        "iam:CreateServiceLinkedRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "iam:UpdateRoleDescription",
        "iam:DeleteServiceLinkedRole",
        "iam:GetServiceLinkedRoleDeletionStatus",
      ],
    }),
    new iam.PolicyStatement({
      resources: ["*"],
      actions: ["iam:ListRoles", "iam:PassRole"],
    })
  );

  role.attachInlinePolicy(policy);

  // role.addManagedPolicy(
  //   iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
  // );

  return policy;
}

export function addPoliciesToCrGetMskConfigVersionLambda(
  scope: Construct,
  role: iam.IRole,
  configName: string
): iam.IRole {
  const policy = new iam.Policy(scope, "msk-config-describe-policy");

  policy.addStatements(
    new iam.PolicyStatement({
      resources: [`arn:${Aws.PARTITION}:kafka:*:*:configuration/${configName}/*`],
      actions: ["kafka:DescribeConfiguration"],
    })
  );
  role.attachInlinePolicy(policy);
  return role;
}

export function addPoliciesToCrDeleteClusterLambda(
  scope: Construct,
  role: iam.IRole,
  props: CrDeleteClusterLambdaProps
): iam.Policy {
  const custerName = props.clusterName;
  const serviceName = props.service;

  const policy = new iam.Policy(scope, "delete-ecs-cluster-policy");

  policy.addStatements(
    new iam.PolicyStatement({
      resources: [
        `arn:${Aws.PARTITION}:ecs:*:*:container-instance/${custerName}/*`,
        `arn:${Aws.PARTITION}:ecs:*:*:task/${custerName}/*`,
        `arn:${Aws.PARTITION}:ecs:*:*:cluster/${custerName}`,
        `arn:${Aws.PARTITION}:ecs:*:*:service/${custerName}/${serviceName}`,
      ],
      actions: [
        "ecs:UpdateService",
        "ecs:DeleteService",
        "ecs:DeleteCluster",
        "ecs:StopTask",
        "ecs:DescribeServices",
        "ecs:ListContainerInstances",
        "ecs:DeregisterContainerInstance",
      ],
    }),
    new iam.PolicyStatement({
      resources: ["*"],
      actions: ["ecs:ListTasks"],
    }),
    new iam.PolicyStatement({
      resources: [
        `arn:${Aws.PARTITION}:autoscaling:*:*:autoScalingGroup:*:autoScalingGroupName/${props.asgName}`,
      ],
      actions: ["autoscaling:DeleteAutoScalingGroup"],
    }),
    new iam.PolicyStatement({
      resources: ["*"],
      actions: ["autoscaling:DescribeAutoScalingGroups"],
    })
  );
  role.attachInlinePolicy(policy);
  return policy;
}

export function grantKinesisStreamReadWrite(
  scope: Construct,
  role: iam.IRole,
  streamName: string
) {
  const policy = new iam.Policy(scope, "kinesis-ro-policy");
  policy.addStatements(
    new iam.PolicyStatement({
      resources: [
        `arn:${Aws.PARTITION}:kinesis:*:*:stream/${streamName}`,
        `arn:${Aws.PARTITION}:kinesis:*:*:stream/${streamName}/*`,
      ],
      actions: [
        "kinesis:DescribeStream",
        "kinesis:DescribeStreamSummary",
        "kinesis:GetRecords",
        "kinesis:GetShardIterator",
        "kinesis:ListShards",
        "kinesis:ListStreams",
        "kinesis:SubscribeToShard",
        "kinesis:PutRecord",
        "kinesis:PutRecords",
      ],
    }),
    new iam.PolicyStatement({
      resources: [`*`],
      actions: ["cloudwatch:PutMetricData"],
    })
  );
  role.attachInlinePolicy(policy);
}

export function grantCloudWatchRead(scope: Construct, role: iam.IRole) {
  // role.addManagedPolicy(
  //   iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")
  // );
  const policy = new iam.Policy(scope, "cloudwatch-read-policy");
  policy.addStatements(
    new iam.PolicyStatement({
      resources: [`*`],
      actions: [
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "ecs:DescribeServices",
        "elasticloadbalancing:DescribeTargetHealth",
      ],
    })
  );
  role.attachInlinePolicy(policy);
}
