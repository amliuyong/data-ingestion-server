import * as sns from "aws-cdk-lib/aws-sns";
import * as subscription from "aws-cdk-lib/aws-sns-subscriptions";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export function createMonitorSns(
  scope: Construct,
): sns.Topic {
  const topic = new sns.Topic(scope, "MonitorSns", {
    displayName: "MonitorSns",
  });
  return topic;
}

export function createEmailSubscriptionToSnsTopic(
  scope: Construct,
  topic: sns.ITopic,
  email: string
): void {
  topic.addSubscription(new subscription.EmailSubscription(email));
}

export function importSnsTopicFromArn(
  scope: Construct,
  id: string,
  topicArn: string
): sns.ITopic {
  return sns.Topic.fromTopicArn(scope, id, topicArn);
}