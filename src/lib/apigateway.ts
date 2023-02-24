import { Stack } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

interface ServerApiProps {
  metricLambda: lambda.Function;
  tokenLambda?: lambda.Function;
}
export function createServerApi(scope: Construct, props: ServerApiProps) {
  const region = Stack.of(scope).region;
  const api = new apigateway.LambdaRestApi(
    scope,
    `${Stack.of(scope).stackName}-server-api`,
    {
      handler: props.metricLambda,
      proxy: false,
      description: `${Stack.of(scope).stackName} Server Api`,
    }
  );
  const v1 = api.root.addResource("v1");
  const metric = v1.addResource("metric", {
    defaultCorsPreflightOptions: {
      allowOrigins: apigateway.Cors.ALL_ORIGINS,
      allowMethods: ["GET"],
    },
  });
  metric.addMethod("GET", undefined, {
    // authorizationType: apigateway.AuthorizationType.IAM,
  });

  let tokenUrl = undefined;
  if (props.tokenLambda) {
    const tokenIntegration = new apigateway.LambdaIntegration(
      props.tokenLambda
    );

    const token = v1.addResource("token", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["POST"],
      },
    });
    token.addMethod("POST", tokenIntegration, {
      // authorizationType: apigateway.AuthorizationType.IAM,
    });
    tokenUrl = `https://${api.restApiId}.execute-api.${region}.amazonaws.com/prod/v1/token`;
  }

  return {
    api,
    metricUrl: `https://${api.restApiId}.execute-api.${region}.amazonaws.com/prod/v1/metric`,
    tokenUrl,
  };
}
