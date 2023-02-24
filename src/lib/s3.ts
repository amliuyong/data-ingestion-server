import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib";

import { Construct } from "constructs";
import { getStringValueFromParameter } from "./ssm";
export function createS3SinkBucket(scope: Construct, id: string = "s3-sink") {
  const s3bucket = new s3.Bucket(scope, "s3-sink", {
    removalPolicy: cdk.RemovalPolicy.RETAIN,
    autoDeleteObjects: false,
    enforceSSL: true,
    encryption: s3.BucketEncryption.S3_MANAGED,
  });
  return s3bucket;
}

export function fromProvidedBucket(
  scope: Construct,
  props: {
    bucketName?: string;
    bucketNameParameterName?: string;
  }
): s3.Bucket {
  let s3Bucket: s3.Bucket;
  if (props.bucketName) {
    s3Bucket = s3.Bucket.fromBucketName(
      scope,
      "s3-sink-bucket-provided",
      props.bucketName
    ) as s3.Bucket;
  } else if (props.bucketNameParameterName) {
    const bucketName = getStringValueFromParameter(
      scope,
      props.bucketNameParameterName
    );
    s3Bucket = s3.Bucket.fromBucketName(
      scope,
      "s3-sink-bucket-provided",
      bucketName
    ) as s3.Bucket;
  } else {
    throw Error("fromProvidedBucket fromBucketName or bucketNameParameterName not set");
  } 
  return s3Bucket;
}

export function createMSKLoggingBucket(scope: Construct) {
  const s3bucket = new s3.Bucket(scope, "msk-log", {
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
    enforceSSL: true,
    encryption: s3.BucketEncryption.S3_MANAGED,
  });
  return s3bucket;
}

export function createMSKPluginResourceBucket(scope: Construct) {
  const s3bucket = new s3.Bucket(scope, "msk-plugin-resource", {
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
    enforceSSL: true,
    encryption: s3.BucketEncryption.S3_MANAGED,
  });
  return s3bucket;
}
