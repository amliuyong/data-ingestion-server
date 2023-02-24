import { Duration, Fn, RemovalPolicy, SecretValue, Stack } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export enum OIDCProvider {
  KEYCLOAK = "KEYCLOAK",
  COGNITO = "COGNITO",
  COGNITO_CREATE_NEW = "COGNITO_CREATE_NEW",
}
export interface OIDCProps {
  issuer: string;
  tokenEndpoint: string;
  userEndpoint: string;
  authorizationEndpoint: string;
  appClientId: string;
  appClientSecret: SecretValue;
}

interface Props {
  serverDomain: string;
  email: string;
}

export function createUserPool(scope: Construct, props: Props): OIDCProps {
  const serverLoginUrl = `https://${props.serverDomain}/login`;

  const pool = new cognito.UserPool(scope, "userPool", {
    userPoolName: Stack.of(scope).stackName + "-userPool",
    selfSignUpEnabled: false,
    signInCaseSensitive: false,
    removalPolicy: RemovalPolicy.DESTROY,
    signInAliases: {
      username: true,
      email: true,
    },
    autoVerify: { email: true },
    passwordPolicy: {
      minLength: 8,
      requireLowercase: true,
      requireUppercase: true,
      requireDigits: false,
      requireSymbols: false,
      tempPasswordValidity: Duration.days(5),
    },
    userInvitation: {
      emailSubject: `Invite to join our ClickStream app[${props.serverDomain}]!`,
      emailBody: `Hello {username},<br/><br/>You have been invited to join our ClickStream app!<br/><br/>Your temporary password is {####}<br>Change password: ${serverLoginUrl}`,
      smsMessage: `Hello {username}, your temporary password for our ClickStream app is {####}`,
    },
  });

  const client = pool.addClient("cs-app-client", {
    generateSecret: true,
    authFlows: {
      userPassword: true,
    },
    oAuth: {
      flows: {
        authorizationCodeGrant: true,
        implicitCodeGrant: true,
      },
      scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
      callbackUrls: [`https://${props.serverDomain}/oauth2/idpresponse`],
    },
  });

  const cfnClient = client.node.defaultChild as cognito.CfnUserPoolClient;
  cfnClient.addPropertyOverride("RefreshTokenValidity", 1);
  cfnClient.addPropertyOverride("SupportedIdentityProviders", ["COGNITO"]);

  const userPoolId = pool.userPoolId;
  const uid = Fn.select(
    4,
    Fn.split("-", Fn.select(2, Fn.split("/", Stack.of(scope).stackId)))
  );
  const domainPrefix = Fn.join("", ["a", uid]);
  pool.addDomain("CognitoDomain", {
    cognitoDomain: {
      domainPrefix,
    },
  });

  new cognito.CfnUserPoolUser(scope, "serverUser", {
    userPoolId,
    userAttributes: [
      {
        name: "email",
        value: props.email,
      },
    ],
    username: "admin",
  });

  const region = Stack.of(scope).region;

  return {
    issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
    tokenEndpoint: `https://${domainPrefix}.auth.${region}.amazoncognito.com/oauth2/token`,
    userEndpoint: `https://${domainPrefix}.auth.${region}.amazoncognito.com/oauth2/userInfo`,
    authorizationEndpoint: `https://${domainPrefix}.auth.${region}.amazoncognito.com/oauth2/authorize`,
    appClientId: client.userPoolClientId,
    appClientSecret: client.userPoolClientSecret,
  };
}
