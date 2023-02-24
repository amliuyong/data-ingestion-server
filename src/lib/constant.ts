import { SecretValue } from "aws-cdk-lib";

export const SOLUTION = {
  SOLUTION_ID: "SO8010",
  SOLUTION_VERSION: "0.0.1",
  SOLUTION_NAME: "ClickStream Analytics Solution on AWS",
  SHORT_NAME: "clickstream",
};

//export const DomainName = `igue1.yonmzn.demo.solutions.aws.a2z.org.cn`;
//export const CertificateArn = `arn:aws:acm:us-east-1:080766874269:certificate/f03e1144-2cf1-4a50-902f-3ace2589e70d`;
export const HostZone_yonmzn_use1 = {
  zoneName: `yonmzn.demo.solutions.aws.a2z.org.cn`,
  hostedZoneId: `Z0668762358AYU3FKF0CF`,
};

// demo account
// *.cs.demo.solutions.aws.a2z.org.cn
// export const CertificateArn = `arn:aws:acm:ap-southeast-1:432014048474:certificate/5990502d-6011-40f3-8bbd-f1bc4212ef42`;
export const HostZone_DEMO_SGP = {
  zoneName: `cs.demo.solutions.aws.a2z.org.cn`,
  hostedZoneId: `Z00378532I8HPJ2HA2J49`,
};

//
// KeyCloak OIDC
// https://keycloak-sb.demo.solutions.aws.a2z.org.cn/auth/realms/cs
// https://keycloak-sb.demo.solutions.aws.a2z.org.cn/auth/realms/cs/.well-known/openid-configuration
// keycloak callback Url: https://cs-server-ec2-keycloak.yonmzn.demo.solutions.aws.a2z.org.cn/oauth2/idpresponse
export const KeyCloakOidcProps = 
  {
    issuer: 'https://keycloak-sb.demo.solutions.aws.a2z.org.cn/auth/realms/cs',
    tokenEndpoint: 'https://keycloak-sb.demo.solutions.aws.a2z.org.cn/auth/realms/cs/protocol/openid-connect/token',
    userEndpoint: 'https://keycloak-sb.demo.solutions.aws.a2z.org.cn/auth/realms/cs/protocol/openid-connect/userinfo',
    authorizationEndpoint: 'https://keycloak-sb.demo.solutions.aws.a2z.org.cn/auth/realms/cs/protocol/openid-connect/auth',
    appClientId: 'cs-client',
    appClientSecret: SecretValue.unsafePlainText('3ef93e0b-df5b-468a-b986-abdc3b11a8e6'),
  }
