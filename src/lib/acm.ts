import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { IHostedZone } from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export function createCertificate(
  scope: Construct,
  hostedZone: IHostedZone
) {
  return new acm.Certificate(scope, "Certificate", {
    domainName: `*.${hostedZone.zoneName}`,
    certificateName: "ClickStream Ingestion Server Service",
    validation: acm.CertificateValidation.fromDns(hostedZone),
  });
}
