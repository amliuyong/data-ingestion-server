import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  createECSClusterAndService,
  EcsEc2NginxAndVectorAsgSetting,
  EcsEc2NginxAsgSetting,
  EcsEc2ServerAsgSetting,
  EcsFargateSetting,
} from "./ecs";
import {
  ServiceType,
  KinesisSinkConfig,
  MskSinkConfig,
  S3SinkConfig,
} from "./stack-main";
import { createALB, NGINX_PORT } from "./alb";
import { createALBSecurityGroup, createECSSecurityGroup } from "./sg";
import { AppConfig } from "./config";
import { grantMskReadWrite } from "./iam";
import { createRecordInRoute53 } from "./route53";
import { createServerMonitor } from "./monitor";
import { IHostedZone } from "aws-cdk-lib/aws-route53";
import { createCertificate } from "./acm";
import { createUserPool, OIDCProps, OIDCProvider } from "./cognito";
import { Stack } from "aws-cdk-lib";
import { createServerApi } from "./apigateway";
import { createAlbLoginLambda, createMetricLambda } from "./lambda";

export interface ServerAuthentication {
  oidcProps?: OIDCProps;
  oidcProvider: OIDCProvider;
}
interface Props {
  vpc: ec2.IVpc;
  ecsServiceType: ServiceType;
  ecsFargateSetting?: EcsFargateSetting;
  ecsEc2NginxAndVectorAsgSetting?: EcsEc2NginxAndVectorAsgSetting;
  ecsEc2LuaNginxAsgSetting?: EcsEc2NginxAsgSetting;
  ecsEc2NginxLogAsgSetting?: EcsEc2NginxAsgSetting;
  ecsEc2JavaServerAsgSetting?: EcsEc2ServerAsgSetting;
  s3Config?: S3SinkConfig;
  mskConfig?: MskSinkConfig;
  kinesisConfig?: KinesisSinkConfig;
  hostedZone?: IHostedZone;
  adminEmail?: string;
  snsTopicArn?: string;
  serverAuth?: ServerAuthentication;
}
export class IngestServerConstruct extends Construct {
  public alb: elbv2.ApplicationLoadBalancer;
  public albSg: ec2.SecurityGroup;
  public cluster: ecs.Cluster;
  public ecsService: ecs.Ec2Service | ecs.FargateService;
  public escTaskRole: iam.IRole;
  public asgRole: iam.IRole;
  public ecsSecurityGroup: ec2.SecurityGroup;
  public autoScalingGroup?: cdk.aws_autoscaling.AutoScalingGroup;
  public albUrl: string;
  public serverUrl: string;
  public loginUrl?: string;
  public tokenUrl?: string;
  public loginTokenApiUrl?: string;
  public metricApiUrl?: string;
  public certificateArn?: string;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const ecsSecurityGroup = createECSSecurityGroup(scope, props.vpc);
    this.ecsSecurityGroup = ecsSecurityGroup;

    if (props.mskConfig?.mskSecurityGroup) {
      //https://docs.aws.amazon.com/msk/latest/developerguide/port-info.html
      const mskSg = props.mskConfig?.mskSecurityGroup;
      // mskSg.addIngressRule(ecsSecurityGroup, ec2.Port.tcp(2181));
      // mskSg.addIngressRule(ecsSecurityGroup, ec2.Port.tcp(9094));
      mskSg.addIngressRule(ecsSecurityGroup, ec2.Port.tcpRange(9092, 9198));
    }

    // ECS Cluster
    const { cluster, ecsService, httpContainerName, autoScalingGroup } =
      createECSClusterAndService(this, {
        ...props,
        ecsSecurityGroup,
      });

    if (!autoScalingGroup) {
      throw Error("autoScalingGroup is undefined");
    }

    this.cluster = cluster;
    this.ecsService = ecsService;
    this.escTaskRole = ecsService.taskDefinition.taskRole;
    this.autoScalingGroup = autoScalingGroup;

    const mskClusterName = props.mskConfig?.mskClusterName;
    if (mskClusterName) {
      const autoScalingGroupRole = this.autoScalingGroup?.role;
      grantMskReadWrite(
        this,
        autoScalingGroupRole,
        mskClusterName,
        "asg-to-msk-policy"
      );
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
    let tokenLambda;
    let serverDomain;

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
        if (!props.serverAuth?.oidcProps) {
          throw new Error(
            `oidcProps must be set, serverAuth.oidcProvider=${props.serverAuth?.oidcProvider}`
          );
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

    // ALB
    const ports = {
      http: AppConfig.serverHttpEndpointPort(),
      https: 443,
    };
    const endpointPath = AppConfig.serverEndpointPath(scope);
    this.albSg = createALBSecurityGroup(this, props.vpc, ports);
    ecsSecurityGroup.addIngressRule(this.albSg, ec2.Port.tcp(NGINX_PORT));

    const { alb, targetGroup, albUrl, healthUrl } = createALB(this, {
      vpc: props.vpc,
      service: ecsService,
      sg: this.albSg,
      ports,
      endpointPath,
      httpContainerName,
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
      asgName: this.autoScalingGroup.autoScalingGroupName,
      ecsClusterName: this.cluster.clusterName,
      ecsServiceName: this.ecsService.serviceName,
      targetGroupArn: targetGroup.targetGroupArn,
    });
    const urls = createServerApi(scope, { metricLambda, tokenLambda });
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
