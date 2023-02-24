import * as cdk from "aws-cdk-lib";
import { CfnParameter, Fn } from "aws-cdk-lib";
import { Construct } from "constructs";

export function addTags(scope: Construct, tags: CfnParameter[]) {
  tags.forEach((tag) => {
    const key = Fn.select(0, Fn.split("=", tag.valueAsString));
    const val = Fn.select(1, Fn.split("=", tag.valueAsString));
    cdk.Tags.of(scope).add(key, val);
  });
}
