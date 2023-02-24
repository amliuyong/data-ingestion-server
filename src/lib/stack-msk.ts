import * as cdk from "aws-cdk-lib";
import { aws_ssm as ssm, Tags } from "aws-cdk-lib";

import { Construct } from "constructs";

import { AppConfig } from "./config";
import { SOLUTION } from "./constant";
import { MSKClusterConstruct } from "./construct-msk";

import {
  TierType,
} from "./stack-main";
import { addTags } from "./tags";

import { setUpVpc } from "./vpc";
export interface MSKStackProps extends cdk.StackProps {
  vpcId?: string;
  vpcIdParameterName?: string;
  profile: {
    tier: TierType;
  };
  mskConfig?: {
    mskTopic?: string;
  };
}
export class MSKStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MSKStackProps) {
    super(scope, id, props);
    const featureName = "MSK";

    this.templateOptions.description = `(${SOLUTION.SOLUTION_ID}) ${SOLUTION.SOLUTION_NAME} - ${featureName} (Version ${SOLUTION.SOLUTION_VERSION})`;

    // VPC
    let vpc = setUpVpc(this, props);

    const config = new AppConfig(this, props.profile);

    const mskTopic = props.mskConfig?.mskTopic || config.getMskTopic();
    const mskSetting = config.getMskSetting();
    const clusterName = cdk.Stack.of(this).stackName + "-msk-cluster";

    const mskConstruct = new MSKClusterConstruct(this, "msk-cluster-construct", {
      vpc,
      clusterName,
      mskTopic,
      mskSetting,
    });
  
    const mskBrokersParam = new ssm.StringParameter(this, "mskBrokersParam", {
      description: "MSK brokers parameter path",
      parameterName: `/${cdk.Stack.of(this).stackName}/mskBrokers`,
      stringValue: mskConstruct.bootstrapBrokers,
    });

    const mskTopicParam = new ssm.StringParameter(this, "mskTopicParam", {
      description: "MSK topic parameter path",
      parameterName: `/${cdk.Stack.of(this).stackName}/mskTopic`,
      stringValue: mskTopic,
    });

    const mskSecurityGroupIdParam = new ssm.StringParameter(
      this,
      "mskSecurityGroupIdParam",
      {
        description: "Msk cluster securityGroupId",
        parameterName: `/${cdk.Stack.of(this).stackName}/mskSecurityGroupId`,
        stringValue: mskConstruct.mskSecurityGroup.securityGroupId,
      }
    );

    const mskClusterNameParam = new ssm.StringParameter(
      this,
      "mskClusterNameParam",
      {
        description: "Msk cluster name",
        parameterName: `/${cdk.Stack.of(this).stackName}/mskClusterName`,
        stringValue: clusterName,
      }
    );

    new cdk.CfnOutput(this, "MskBrokersParameter", {
      value: mskBrokersParam.parameterName,
    });

    new cdk.CfnOutput(this, "MskTopicParameter", {
      value: mskTopicParam.parameterName,
    });

    new cdk.CfnOutput(this, "MskSecurityGroupIdParameter", {
      value: mskSecurityGroupIdParam.parameterName,
    });

    new cdk.CfnOutput(this, "MskClusterNameParamParameter", {
      value: mskClusterNameParam.parameterName,
    });

    new cdk.CfnOutput(this, "MskBootstrapBrokers", {
      value: mskConstruct.bootstrapBrokers,
    });

    new cdk.CfnOutput(this, "MskTopic", {
      value: mskTopic,
    });

    new cdk.CfnOutput(this, "MskClusterName", {
      value: clusterName,
    });

    new cdk.CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
    });
  }
}
