import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { Stack, Token } from "aws-cdk-lib";
import { getVpcIdFromParameter } from "./ssm";

export interface VPCPros {
  readonly cidr: string;
  readonly createS3Endpoint?: boolean;
}

export const setUpVpc = (
  scope: Construct,
  props: {
    vpcId?: string;
    vpcIdParameterName?: string;
  }
) => {
  let vpc;
  if (props.vpcId) {
    vpc = vpcFromId(scope, props.vpcId);
  } else if (props.vpcIdParameterName) {
    const vpcId = getVpcIdFromParameter(scope, props.vpcIdParameterName);
    vpc = vpcFromId(scope, Token.asString(vpcId));
  } else {
    vpc = createVPC(scope);
  }
  return vpc;
};

export const vpcFromId = (scope: Construct, vpcId: string) => {
  if (vpcId == "default") {
    return ec2.Vpc.fromLookup(scope, "vpc-" + vpcId, {
      isDefault: true,
    });
  } else {
    return ec2.Vpc.fromLookup(scope, "vpc-" + vpcId, {
      vpcId,
    });
  }
};

export const createVPC = (
  scope: Construct,
  props: VPCPros = {
    cidr: "10.1.0.0/16",
    createS3Endpoint: true,
  }
) => {
  const vpc = new ec2.Vpc(scope, "vpc", {
    maxAzs: 2,
    ipAddresses: ec2.IpAddresses.cidr(props.cidr),
    enableDnsSupport: true,
    natGateways: 2,
    subnetConfiguration: [
      {
        cidrMask: 18,
        name: "subnet-public",
        subnetType: ec2.SubnetType.PUBLIC,
      },
      {
        cidrMask: 18,
        name: "subnet-private-with-egress",
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    ],
  });

  if (props.createS3Endpoint) {
    vpc.addGatewayEndpoint("s3-endpoint", {
     service: ec2.GatewayVpcEndpointAwsService.S3,
    });
  }
  return vpc;
};

export const getServiceSubnets = (vpc: ec2.IVpc, service: string) => {
  const selectedZones = getAppAZs(vpc);
  let publicSubnet = false;
  let selectedSubnets: ec2.SubnetSelection = {
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    availabilityZones: selectedZones,
  };
  try {
    vpc.selectSubnets(selectedSubnets);
  } catch {
    selectedSubnets = {
      subnetType: ec2.SubnetType.PUBLIC,
      availabilityZones: selectedZones,
    };
    publicSubnet = true;
    console.warn(
      `[${service}] vpcId: ${vpc.vpcId}, AZs: ${selectedZones} cannot find SubnetType.PRIVATE_WITH_EGRESS, use SubnetType.PUBLIC`
    );
  }
  return { selectedSubnets, publicSubnet };
};

export const getALBSubnets = (vpc: ec2.IVpc) => {
  return {
    subnetType: ec2.SubnetType.PUBLIC,
    availabilityZones: getALBAZs(vpc),
  };
};

function getAZs(vpc: ec2.IVpc, azCount: number = 2): string[] {
  const selectedZones = vpc.availabilityZones.filter((zoneName, index) => {
    return index < azCount;
  });
  return selectedZones;
}

function getALBAZs(vpc: ec2.IVpc): string[] {
  return getAZs(vpc, 2);
}

function getAppAZs(vpc: ec2.IVpc): string[] {
  return getAZs(vpc, 2);
}
