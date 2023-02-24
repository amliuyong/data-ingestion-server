import { Provider } from "aws-cdk-lib/custom-resources";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import { CustomResource } from "aws-cdk-lib";
import {
  CrDeleteClusterLambdaProps,
  createCrDeleteClusterLambda,
  createCrGetMskConfigVersionLambda,
  createCrMskS3SinkConnectorLambda,
  createCrMskTopicLambda,
  CrGetMskConfigVersionLambdaProps,
  CrMskS3SinkConnectorLambdaProps,
  CrMskTopicLambdaProps,
} from "./lambda";

export function createS3SinkConnectorCustomResource(
  scope: Construct,
  props: CrMskS3SinkConnectorLambdaProps
) : cdk.Resource {
  const { fn, policy } = createCrMskS3SinkConnectorLambda(scope, props);

  if (props.createS3SinkConnector) {
    const provider = new Provider(scope, "CrS3SinkConnectorProvider", {
      onEventHandler: fn,
      logRetention: RetentionDays.ONE_WEEK,
    });
    const cr = new CustomResource(scope, "CrS3SinkConnectorCustomResource", {
      serviceToken: provider.serviceToken,
    });
    if (policy) {
      cr.node.addDependency(policy);
    }
    return cr;
  }
  return fn;
}

export function createGetMskConfigVersionCustomResource(
  scope: Construct,
  props: CrGetMskConfigVersionLambdaProps
) {
  const fn = createCrGetMskConfigVersionLambda(scope, props);
  const provider = new Provider(scope, "CrGetMskConfigVersionProvider", {
    onEventHandler: fn,
    logRetention: RetentionDays.ONE_WEEK,
  });
  const cr = new CustomResource(scope, "CrGetMskConfigVersionCustomResource", {
    serviceToken: provider.serviceToken,
  });
  return cr;
}

export function createCreateMskTopicCustomResource(
  scope: Construct,
  props: CrMskTopicLambdaProps
) {
  const fn = createCrMskTopicLambda(scope, props);
  const provider = new Provider(scope, "CrMskTopicProvider", {
    onEventHandler: fn,
    logRetention: RetentionDays.ONE_WEEK,
  });
  const cr = new CustomResource(scope, "CrMskTopicCustomResource", {
    serviceToken: provider.serviceToken,
  });
  return cr;
}

export function createDeleteClusterCustomResource(
  scope: Construct,
  props: CrDeleteClusterLambdaProps
) {
  const { fn, policy } = createCrDeleteClusterLambda(scope, props);
  const provider = new Provider(scope, "CrDeleteClusterProvider", {
    onEventHandler: fn,
    logRetention: RetentionDays.ONE_WEEK,
  });
  const cr = new CustomResource(scope, "CrDeleteClusterCustomResource", {
    serviceToken: provider.serviceToken,
  });

  cr.node.addDependency(fn);
  if (policy) {
    cr.node.addDependency(policy);
  }
  return cr;
}
