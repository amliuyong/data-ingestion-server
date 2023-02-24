import { aws_ssm as ssm } from "aws-cdk-lib";
import { Construct } from "constructs";

export function getVpcIdFromParameter(
  scope: Construct,
  paramName: string
): string {
  const vpcId = ssm.StringParameter.valueFromLookup(scope, paramName);
  return vpcId;
}

export function getStringValueFromParameter(
  scope: Construct,
  paramName: string
): string {
  const stringValue = ssm.StringParameter.valueForStringParameter(
    scope,
    paramName
  );
  return stringValue;
}


