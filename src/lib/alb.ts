import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";

import { Construct } from "constructs";
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { getALBSubnets } from "./vpc";
import { OIDCProps } from "./cognito";
import {  UnauthenticatedAction } from "aws-cdk-lib/aws-elasticloadbalancingv2";

export const NGINX_PORT = 8088;

function addECSTargetsToListener(
  scope: Construct,
  service: ecs.Ec2Service | ecs.FargateService,
  listener: elbv2.ApplicationListener,
  endpointPath: string,
  nginxContainerName: string,
  oidcAuthProps?: OIDCProps,
  tokenLambda?: lambda.Function
) {
  const targetGroup = listener.addTargets("ECS", {
    protocol: elbv2.ApplicationProtocol.HTTP,
    port: NGINX_PORT,
    targets: [
      service.loadBalancerTarget({
        containerName: nginxContainerName,
        containerPort: NGINX_PORT,
      }),
    ],
    healthCheck: {
      enabled: true,
      protocol: elbv2.Protocol.HTTP,
      port: NGINX_PORT.toString(),
      path: "/health",
      interval: cdk.Duration.seconds(10),
      timeout: cdk.Duration.seconds(6),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    },
  });

  let tokenTarget;
  if (tokenLambda) {
    tokenTarget = listener.addTargets("token-target", {
      targets: [new targets.LambdaTarget(tokenLambda)],
    });
  }

  addActionRules(
    listener,
    endpointPath,
    targetGroup,
    "forwardToECS",
    oidcAuthProps,
    tokenTarget
  );

  return targetGroup;
}
export interface ALBProps {
  vpc: ec2.IVpc;
  certificateArn?: string;
  sg: SecurityGroup;
  service: ecs.Ec2Service | ecs.FargateService;
  endpointPath: string;
  httpContainerName: string;
  ports: {
    http: number;
    https: number;
  };
  oidcAuthProps?: OIDCProps;
  tokenLambda?: lambda.Function;
}

export function createALB(scope: Construct, props: ALBProps) {
  const endpointPath = props.endpointPath;
  const httpPort = props.ports.http;
  const httpsPort = props.ports.https;
  const httpContainerName = props.httpContainerName;

  if (props.oidcAuthProps && !props.certificateArn) {
    throw new Error("certificateArn must be set when config auth with OIDC");
  }

  const alb = new elbv2.ApplicationLoadBalancer(scope, "alb", {
    loadBalancerName: cdk.Stack.of(scope).stackName,
    vpc: props.vpc,
    internetFacing: true,
    securityGroup: props.sg,
    vpcSubnets: getALBSubnets(props.vpc),
  });


  let urls: { albUrl: string; healthUrl: string };
  let targetGroup;

  if (props.certificateArn) {
    const httpsListener = alb.addListener("HTTPSListener", {
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: httpsPort,
    });
    httpsListener.addCertificates("Certificate", [
      elbv2.ListenerCertificate.fromArn(props.certificateArn),
    ]);
    targetGroup = addECSTargetsToListener(
      scope,
      props.service,
      httpsListener,
      endpointPath,
      httpContainerName,
      props.oidcAuthProps,
      props.tokenLambda
    );

    urls = getUrls(alb, "https", httpsPort, endpointPath);

    const HttpRedirectListener = alb.addListener("HttpRedirectListener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: httpPort,
    });

    HttpRedirectListener.addAction("RedirectToHTTPS", {
      action: elbv2.ListenerAction.redirect({
        protocol: elbv2.ApplicationProtocol.HTTPS,
        port: `${httpsPort}`,
      }),
    });
  } else {
    const httpListener = alb.addListener("Listener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: httpPort,
    });
    targetGroup = addECSTargetsToListener(
      scope,
      props.service,
      httpListener,
      endpointPath,
      httpContainerName
    );

    urls = getUrls(alb, "http", httpPort, endpointPath);
  }

  return { alb, targetGroup, albUrl: urls.albUrl, healthUrl: urls.healthUrl };
}

function getUrls(
  alb: elbv2.ApplicationLoadBalancer,
  schema: string,
  httpPort: number,
  endpointPath: string
) {
  let albUrl = "";
  let healthUrl = "";

  if (schema == "http") {
    if (httpPort != 80) {
      albUrl = `http://${alb.loadBalancerDnsName}:${httpPort}${endpointPath}`;
      healthUrl = `http://${alb.loadBalancerDnsName}/health`;
    } else {
      albUrl = `http://${alb.loadBalancerDnsName}${endpointPath}`;
      healthUrl = `http://${alb.loadBalancerDnsName}/health`;
    }
  } else {
    // https
    if (httpPort != 443) {
      albUrl = `https://${alb.loadBalancerDnsName}:${httpPort}${endpointPath}`;
      healthUrl = `https://${alb.loadBalancerDnsName}/health`;
    } else {
      albUrl = `https://${alb.loadBalancerDnsName}${endpointPath}`;
      healthUrl = `https://${alb.loadBalancerDnsName}/health`;
    }
  }
  return { albUrl, healthUrl };
}

export interface AlbWithLambdaServerProps {
  vpc: ec2.IVpc;
  certificateArn?: string;
  sg: SecurityGroup;
  lambdaServer: lambda.Function;
  endpointPath: string;
  ports: {
    http: number;
    https: number;
  };
  oidcAuthProps?: OIDCProps;
  tokenLambda?: lambda.Function;
}

export function createALBWithLambdaServer(
  scope: Construct,
  props: AlbWithLambdaServerProps
) {
  let albUrl = "";
  let healthUrl = "";
  const endpointPath = props.endpointPath;
  const httpPort = props.ports.http;
  const httpsPort = props.ports.https;
  const lambdaServer = props.lambdaServer;

  const alb = new elbv2.ApplicationLoadBalancer(scope, "lambda-alb", {
    loadBalancerName: cdk.Stack.of(scope).stackName,
    vpc: props.vpc,
    internetFacing: true,
    securityGroup: props.sg,
    vpcSubnets: getALBSubnets(props.vpc),
  });

  if (props.certificateArn) {
    const httpsListener = alb.addListener("HTTPSListener", {
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: httpsPort,
    });
    httpsListener.addCertificates("Certificate", [
      elbv2.ListenerCertificate.fromArn(props.certificateArn),
    ]);
    addLambdaTargetsToListener(
      scope,
      lambdaServer,
      httpsListener,
      endpointPath,
      props.oidcAuthProps,
      props.tokenLambda
    );
    albUrl = `https://${alb.loadBalancerDnsName}${endpointPath}`;

    const HttpRedirectListener = alb.addListener("HttpRedirectListener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: httpPort,
    });

    HttpRedirectListener.addAction("RedirectToHTTPS", {
      action: elbv2.ListenerAction.redirect({
        protocol: elbv2.ApplicationProtocol.HTTPS,
        port: `${httpsPort}`,
      }),
    });
  } else {
    const httpListener = alb.addListener("Listener", {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: httpPort,
    });
    addLambdaTargetsToListener(scope, lambdaServer, httpListener, endpointPath);

    if (httpPort != 80) {
      albUrl = `http://${alb.loadBalancerDnsName}:${httpPort}${endpointPath}`;
      healthUrl = `http://${alb.loadBalancerDnsName}/health`;
    } else {
      albUrl = `http://${alb.loadBalancerDnsName}${endpointPath}`;
      healthUrl = `http://${alb.loadBalancerDnsName}/health`;
    }
  }
  return { alb, albUrl, healthUrl };
}

function addLambdaTargetsToListener(
  scope: Construct,
  lambdaFunction: lambda.Function,
  listener: elbv2.ApplicationListener,
  endpointPath: string,
  oidcAuthProps?: OIDCProps,
  tokenLambda?: lambda.Function
) {
  const targetGroup = listener.addTargets("Targets", {
    targets: [new targets.LambdaTarget(lambdaFunction)],
    healthCheck: {
      enabled: true,
      path: "/health",
      interval: cdk.Duration.seconds(60),
      timeout: cdk.Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2,
    },
  });

  let tokenTarget;
  if (tokenLambda) {
    tokenTarget = listener.addTargets("token-target", {
      targets: [new targets.LambdaTarget(tokenLambda)],
    });
  }

  addActionRules(
    listener,
    endpointPath,
    targetGroup,
    "forwardToLambda",
    oidcAuthProps,
    tokenTarget
  );
}

function addActionRules(
  listener: elbv2.ApplicationListener,
  endpointPath: string,
  serviceTargetGroup: elbv2.ApplicationTargetGroup,
  forwardRuleName: string,
  oidcAuthProps?: OIDCProps,
  tokenTarget?: elbv2.ApplicationTargetGroup
) {
  if (oidcAuthProps) {
    listener.addAction(`${forwardRuleName}-auth`, {
      priority: 3,
      conditions: [
        elbv2.ListenerCondition.httpRequestMethods(["GET"]),
        elbv2.ListenerCondition.pathPatterns(["/login"]),
      ],
      action: elbv2.ListenerAction.authenticateOidc({
        authorizationEndpoint: oidcAuthProps.authorizationEndpoint,
        clientId: oidcAuthProps.appClientId,
        clientSecret: oidcAuthProps.appClientSecret,
        issuer: oidcAuthProps.issuer,
        tokenEndpoint: oidcAuthProps.tokenEndpoint,
        userInfoEndpoint: oidcAuthProps.userEndpoint,
        onUnauthenticatedRequest: UnauthenticatedAction.AUTHENTICATE,
        //sessionTimeout: Duration.seconds(604800), this is the default value
        next: elbv2.ListenerAction.fixedResponse(200, {
          contentType: "text/plain",
          messageBody: "Authenticated",
        }),
      }),
    });
    listener.addAction(forwardRuleName, {
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns([`${endpointPath}*`])],
      action: elbv2.ListenerAction.authenticateOidc({
        authorizationEndpoint: oidcAuthProps.authorizationEndpoint,
        clientId: oidcAuthProps.appClientId,
        clientSecret: oidcAuthProps.appClientSecret,
        issuer: oidcAuthProps.issuer,
        tokenEndpoint: oidcAuthProps.tokenEndpoint,
        userInfoEndpoint: oidcAuthProps.userEndpoint,
        onUnauthenticatedRequest: UnauthenticatedAction.DENY,
        next: elbv2.ListenerAction.forward([serviceTargetGroup]),
      }),
    });

    listener.addAction(`${forwardRuleName}-health`, {
      priority: 4,
      conditions: [
        elbv2.ListenerCondition.httpRequestMethods(["GET"]),
        elbv2.ListenerCondition.pathPatterns(["/health"]),
      ],
      action: elbv2.ListenerAction.forward([serviceTargetGroup]),
    });

    if (tokenTarget) {
      listener.addAction(`${forwardRuleName}-token`, {
        priority: 2,
        conditions: [
          elbv2.ListenerCondition.httpRequestMethods(["POST"]),
          elbv2.ListenerCondition.pathPatterns(["/token"]),
        ],
        action: elbv2.ListenerAction.forward([tokenTarget]),
      });
    }
  } else {
    listener.addAction(forwardRuleName, {
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.pathPatterns([`${endpointPath}*`, "/health"]),
      ],
      action: elbv2.ListenerAction.forward([serviceTargetGroup]),
    });
  }

  listener.addAction("DefaultAction", {
    action: elbv2.ListenerAction.fixedResponse(403, {
      contentType: "text/plain",
      messageBody: "DefaultAction: Invalid request",
    }),
  });
  listener.connections.allowDefaultPortFromAnyIpv4("Open to the world");
}
