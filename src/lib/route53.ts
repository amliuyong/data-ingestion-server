import { aws_route53 as route53, CfnOutput } from "aws-cdk-lib";
import { IHostedZone } from "aws-cdk-lib/aws-route53";
import  * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export function createRecordInRoute53(
  scope: Construct,
  alb: elbv2.ApplicationLoadBalancer,
  hostedZone: IHostedZone,
  serverDomainPrefix: string,
) {
  const record = new route53.ARecord(scope, "AlbRecord", {
    recordName: serverDomainPrefix,
    zone: hostedZone,
    target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)),
  });

  new CfnOutput(scope, "HostZoneDomainName", {
    value: record.domainName,
    description: "Host Zone Domain Name",
  });

  return record;
}

export function getHostedZone(
  scope: Construct,
  hostedZoneId: string,
  zoneName: string
) : IHostedZone{
  return route53.PublicHostedZone.fromHostedZoneAttributes(scope, "zone", {
      hostedZoneId,
      zoneName,
  });
}
