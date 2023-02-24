import { CfnParameter } from "aws-cdk-lib";
import { Construct } from "constructs";

export function createTagsParameters(scope: Construct) {
  const tag1Parameter = new CfnParameter(scope, "Tag1Parameter", {
    type: "String",
    default: "Env=Test",
    description: "Tag",
  });

  const tag2Parameter = new CfnParameter(scope, "Tag2Parameter", {
    type: "String",
    default: "ProjectId=default",
    description: "Tag",
  });

  const tag3Parameter = new CfnParameter(scope, "Tag3Parameter", {
    type: "String",
    default: "CostCenter=c001",
    description: "Tag",
  });

  return [tag1Parameter, tag2Parameter, tag3Parameter];
}

export function createParameters(scope: Construct) {
  const adminEmail = new CfnParameter(scope, "adminEmail", {
    type: "String",
    default: "",
    description: "Administrator Email",
  });

  const snsTopicArn = new CfnParameter(scope, "snsTopicArn", {
    type: "AWS::SSM::Parameter::Value<String>",
    default: "/clickstream-infra/snsTopicArn",
    description: "SNS topic Arn",
  });
  return { adminEmail, snsTopicArn };
}
