import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

import { KinesisSinkConfig, MskSinkConfig } from "./stack-main";
import { createALBWithLambdaServer, NGINX_PORT } from "./alb";
import { createALBSecurityGroup, createLambdaServerSecurityGroup } from "./sg";
import { AppConfig } from "./config";

import {
  createAlbLoginLambda,
  createAlbReceiverLambda,
  createMetricLambda,
} from "./lambda";
import { createRecordInRoute53 } from "./route53";
import { createServerMonitor } from "./monitor";
import { IHostedZone } from "aws-cdk-lib/aws-route53";
import { createCertificate } from "./acm";
import { ServerAuthentication } from "./consturct-ingest-server";
import { Stack } from "aws-cdk-lib";
import { createUserPool, OIDCProps, OIDCProvider } from "./cognito";
import { createServerApi } from "./apigateway";

export interface LambdaSetting {
  memorySize: number;
  timeoutSec: number;
}

interface Props {
  vpc: ec2.IVpc;
  mskConfig?: MskSinkConfig;
  kinesisConfig?: KinesisSinkConfig;
  hostedZone?: IHostedZone;
  lambdaSetting: LambdaSetting;
  adminEmail?: string;
  snsTopicArn?: string;
  serverAuth?: ServerAuthentication;
}
export class IngestLambdaServerConstruct extends Construct {
  public alb: elbv2.ApplicationLoadBalancer;
  public albSg: ec2.SecurityGroup;
  public lambdaSecurityGroup: ec2.SecurityGroup;
  public lambdaRole?: iam.IRole;
  public lambdaFn: lambda.Function;
  public albUrl: string;
  public serverUrl: string;
  public loginUrl?: string;
  public tokenUrl?: string;
  public loginTokenApiUrl?: string;
  public metricApiUrl?: string;
  public certificateArn?: string;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const lambdaSecurityGroup = createLambdaServerSecurityGroup(
      scope,
      props.vpc
    );
    this.lambdaSecurityGroup = lambdaSecurityGroup;

    if (props.mskConfig?.mskSecurityGroup) {
      const mskSg = props.mskConfig?.mskSecurityGroup;
      mskSg.addIngressRule(lambdaSecurityGroup, ec2.Port.tcpRange(9092, 9198));
    }

    let useHttps = false;
    if (props.hostedZone) {
      useHttps = true;
      this.certificateArn = createCertificate(
        this,
        props.hostedZone
      ).certificateArn;
    }

    const serverDomainPrefix = Stack.of(scope).stackName;
    let oidcAuthProps: OIDCProps | undefined;
    let serverDomain;
    let tokenLambda;

    if (useHttps) {
      serverDomain = `${serverDomainPrefix}.${props.hostedZone?.zoneName}`;
      if (props.serverAuth?.oidcProvider == OIDCProvider.COGNITO_CREATE_NEW) {
        if (!props.adminEmail) {
          throw new Error(
            "adminEmail must be set, serverAuth.oidcProvider=COGNITO_CREATE_NEW"
          );
        }
        oidcAuthProps = createUserPool(scope, {
          serverDomain,
          email: props.adminEmail,
        });
      } else if (props.serverAuth?.oidcProvider) {
        if (!props.serverAuth.oidcProps) {
          `oidcProps must be set, serverAuth.oidcProvider=${props.serverAuth?.oidcProvider}`;
        }
        oidcAuthProps = props.serverAuth.oidcProps;
      }

      if (props.serverAuth && serverDomain) {
        tokenLambda = createAlbLoginLambda(scope, {
          loginUrl: `https://${serverDomain}/login`,
          oidcProvider: props.serverAuth.oidcProvider,
        });
      }
    }

    // lambda function
    const lambdaServer = createAlbReceiverLambda(scope, {
      mskBrokerString: props.mskConfig?.mskBrokers || "__NOT_SET__",
      mskTopic: props.mskConfig?.mskTopic || "__NOT_SET__",
      kinesisStreamName: props.kinesisConfig?.streamName || "__NOT_SET__",
      vpc: props.vpc,
      lambdaSecurityGroup,
      lambdaSetting: props.lambdaSetting,
    });
    this.lambdaRole = lambdaServer.role;
    this.lambdaFn = lambdaServer;

    // ALB
    const ports = {
      http: AppConfig.serverHttpEndpointPort(),
      https: 443,
    };
    const endpointPath = AppConfig.serverEndpointPath(scope);
    this.albSg = createALBSecurityGroup(this, props.vpc, ports);
    lambdaSecurityGroup.addIngressRule(this.albSg, ec2.Port.tcp(NGINX_PORT));

    const { alb, albUrl, healthUrl } = createALBWithLambdaServer(this, {
      vpc: props.vpc,
      lambdaServer,
      sg: this.albSg,
      ports,
      endpointPath,
      certificateArn: this.certificateArn,
      oidcAuthProps,
      tokenLambda,
    });
    this.alb = alb;
    this.albUrl = albUrl;
    this.serverUrl = this.albUrl;

    // add route53 record
    if (props.hostedZone) {
      const record = createRecordInRoute53(
        scope,
        this.alb,
        props.hostedZone,
        serverDomainPrefix
      );
      this.serverUrl = `https://${record.domainName}${endpointPath}`;
      this.loginUrl = `https://${record.domainName}/login`;
      this.tokenUrl = `https://${record.domainName}/token`;
    }

    const metricLambda = createMetricLambda(scope, {
      albFullName: this.alb.loadBalancerFullName,
    });

    const urls = createServerApi(scope, {
      metricLambda,
      tokenLambda,
    });
    this.loginTokenApiUrl = urls.tokenUrl;
    this.metricApiUrl = urls.metricUrl;

    if (props.snsTopicArn) {
      createServerMonitor(
        scope,
        props.snsTopicArn,
        healthUrl,
        props.adminEmail
      );
    }
  }
}
