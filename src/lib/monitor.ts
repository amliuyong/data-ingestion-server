import { Construct } from "constructs";
import { createServerMonitorEvent } from "./events";
import {
  createEmailSubscriptionToSnsTopic,
  importSnsTopicFromArn,
} from "./sns";

export function createServerMonitor(
  scope: Construct,
  snsTopicArn: string,
  serverUrl: string,
  email?: string
) {
  const snsTopic = importSnsTopicFromArn(scope, "sns-topic", snsTopicArn);
  if (email) {
    createEmailSubscriptionToSnsTopic(scope, snsTopic, email);
  }
  createServerMonitorEvent(scope, serverUrl, snsTopic);
}
