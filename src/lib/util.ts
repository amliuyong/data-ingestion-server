import { Construct } from "constructs";
import { aws_ec2 as ec2 } from "aws-cdk-lib";
import { getStringValueFromParameter } from "./ssm";

export function getParamValue(
  scope: Construct,
  v: { value?: string; valuePath?: string }
): string | undefined {
  if (v.value) {
    return v.value;
  }
  if (v.valuePath) {
    return getStringValueFromParameter(scope, v.valuePath);
  }
  return undefined;
}

export function getExistingStreamName(
  scope: Construct,
  kinesisConfig: {
    streamName?: string;
    streamNameParameterName?: string;
  }
): string {
  const streamName = getParamValue(scope, {
    value: kinesisConfig.streamName,
    valuePath: kinesisConfig.streamNameParameterName,
  });
  if (streamName) {
    return streamName;
  }
  throw new Error("streamName or streamNameParameterName not set");
}

export function getExistingMskConfig(
  scope: Construct,
  mskConfig: {
    mskBrokers?: string;
    mskBrokersParameterName?: string;
    mskTopic?: string;
    mskTopicParameterName?: string;
    mskSecurityGroupId?: string;
    mskSecurityGroupIdParameterName?: string;
    mskClusterName?: string;
    mskClusterNameParameterName?: string;
  }
) {
  const mskTopic = getMskTopic(scope, mskConfig);
  const mskSecurityGroup = getMskSecurityGroup(scope, mskConfig);
  const mskClusterName = getMskClusterName(scope, mskConfig);
  const mskBrokers = getMskBrokers(scope, mskConfig);
  return {
    mskBrokers,
    mskTopic,
    mskSecurityGroup,
    mskClusterName,
  };
}

export function getExistingBucketName(
  scope: Construct,
  s3Config: {
    bucketName?: string;
    bucketNameParameterName?: string;
  }
): string {
  const name = getParamValue(scope, {
    value: s3Config.bucketName,
    valuePath: s3Config.bucketNameParameterName,
  });
  if (name) {
    return name;
  }
  throw new Error("bucketName or bucketNameParameterName not set");
}

export function getMskTopic(
  scope: Construct,
  mskConfig: {
    mskTopic?: string;
    mskTopicParameterName?: string;
  }
): string {
  const name = getParamValue(scope, {
    value: mskConfig.mskTopic,
    valuePath: mskConfig.mskTopicParameterName,
  });
  if (name) {
    return name;
  }
  throw new Error("mskTopic or mskTopicParameterName not set");
}

export function getMskBrokers(
  scope: Construct,
  mskConfig: {
    mskBrokers?: string;
    mskBrokersParameterName?: string;
  }
): string {
  const name = getParamValue(scope, {
    value: mskConfig.mskBrokers,
    valuePath: mskConfig.mskBrokersParameterName,
  });
  if (name) {
    return name;
  }
  throw new Error("mskBrokers or mskBrokersParameterName not set");
}

export function getMskClusterName(
  scope: Construct,
  mskConfig: {
    mskClusterName?: string;
    mskClusterNameParameterName?: string;
  }
): string {
  const name = getParamValue(scope, {
    value: mskConfig.mskClusterName,
    valuePath: mskConfig.mskClusterNameParameterName,
  });
  if (name) {
    return name;
  }
  throw new Error("mskClusterName or mskClusterNameParameterName not set");
}

export function getMskSecurityGroup(
  scope: Construct,
  mskConfig?: {
    mskSecurityGroupId?: string;
    mskSecurityGroupIdParameterName?: string;
  }
): ec2.ISecurityGroup {
  if (mskConfig?.mskSecurityGroupId) {
    return ec2.SecurityGroup.fromSecurityGroupId(
      scope,
      "mskSecurityGroup",
      mskConfig?.mskSecurityGroupId
    );
  }

  if (mskConfig?.mskSecurityGroupIdParameterName) {
    const mskSecurityGroupId = getStringValueFromParameter(
      scope,
      mskConfig?.mskSecurityGroupIdParameterName
    );
    return ec2.SecurityGroup.fromSecurityGroupId(
      scope,
      "mskSecurityGroup",
      mskSecurityGroupId
    );
  }
  throw new Error("mskSecurityGroupId or mskSecurityGroupIdParameterName not set");

}


export function getSnsTopicArn(scope: Construct, snsTopicArn?: string, snsTopicArnParam? : string ) {
  return getParamValue(scope, { value: snsTopicArn, valuePath: snsTopicArnParam })
}
