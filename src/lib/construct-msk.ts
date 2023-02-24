import * as cdk from "aws-cdk-lib";
import * as msk from "@aws-cdk/aws-msk-alpha";
import * as msk2 from "aws-cdk-lib/aws-msk";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as appscaling from "aws-cdk-lib/aws-applicationautoscaling";

import { Construct } from "constructs";
import { createMSKLoggingBucket, createMSKPluginResourceBucket } from "./s3";
import {
  createMskCustomResourceLambdaSecurityGroup,
  createMSKSecurityGroup,
} from "./sg";
import {
  createCreateMskTopicCustomResource,
  createGetMskConfigVersionCustomResource,
} from "./custom-resource";
import { getServiceSubnets } from "./vpc";

export interface MSKSetting {
  topicPartitionCount: number;
  numberOfBrokerNodesPerAz: number;
  ebsVolumeSize: number;
  instanceSize: ec2.InstanceSize; // kafka.m5.large
  dataRetentionHours: number;
}

export interface S3SinkConnectorSetting {
  maxWorkerCount: number;
  minWorkerCount: number;
  workerMcuCount: number;
}

interface Props {
  vpc: ec2.IVpc;
  mskTopic: string;
  mskSetting: MSKSetting;
  clusterName: string;
}

export class MSKClusterConstruct extends Construct {
  public bootstrapBrokers: string;
  public mskSecurityGroup: ec2.SecurityGroup;
  public mskCluster: msk.Cluster;
  public mskConfiguration: msk2.CfnConfiguration;

  static KAFKA_VERSION = msk.KafkaVersion.V2_6_2;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    this.createMskCluster(scope, props);
    new cdk.CfnOutput(this, "MskBootstrapBrokers", {
      value: this.bootstrapBrokers,
    });
  }

  private createMskConfig(props: Props) {
    // https://docs.aws.amazon.com/msk/latest/developerguide/msk-configuration-properties.html
    const serverProperties = [
      "auto.create.topics.enable=false",
      "num.partitions=3",
      `log.retention.hours=${props.mskSetting.dataRetentionHours}`,
    ];
    this.mskConfiguration = new msk2.CfnConfiguration(
      this,
      "mskConfiguration",
      {
        name: `${props.clusterName}-config`,
        serverProperties: serverProperties.join("\n"),
        kafkaVersionsList: [MSKClusterConstruct.KAFKA_VERSION.version],
      }
    );
    const configVersionCr = createGetMskConfigVersionCustomResource(this, {
      configArn: this.mskConfiguration.attrArn,
      configName: this.mskConfiguration.name,
    });
    configVersionCr.node.addDependency(this.mskConfiguration);

    return {
      version: cdk.Token.asNumber(configVersionCr.getAtt("version")),
      arn: this.mskConfiguration.attrArn,
      mskConfiguration: this.mskConfiguration,
    };
  }

  private createTopic(
    scope: Construct,
    props: Props,
    extraProps: {
      mskSecurityGroup: ec2.SecurityGroup;
      mskCluster: msk.Cluster;
    }
  ) {
    const mskCustomResourceLambdaSecurityGroup =
      createMskCustomResourceLambdaSecurityGroup(
        this,
        props.vpc,
        extraProps.mskSecurityGroup
      );

    // create Topic
    const topicCr = createCreateMskTopicCustomResource(this, {
      vpc: props.vpc,
      lambdaSecurityGroup: mskCustomResourceLambdaSecurityGroup,
      mskTopic: props.mskTopic,
      mskTopicPartitionCountStringValue:
        props.mskSetting.topicPartitionCount + "",
      brokersString: extraProps.mskCluster.bootstrapBrokers,
    });
    topicCr.node.addDependency(extraProps.mskCluster);
  }

  private addStorageAutoScaling(
    props: Props,
    mskCluster: msk.Cluster
  ): appscaling.ScalableTarget {
    const target = new appscaling.ScalableTarget(
      this,
      "MskStorageScalableTarget",
      {
        serviceNamespace: appscaling.ServiceNamespace.KAFKA,
        maxCapacity: props.mskSetting.ebsVolumeSize * 4,
        minCapacity: 1,
        resourceId: mskCluster.clusterArn,
        scalableDimension: "kafka:broker-storage:VolumeSize",
      }
    );

    target.scaleToTrackMetric("MskStorageScalingTrackMetric", {
      targetValue: 80,
      predefinedMetric:
        appscaling.PredefinedMetric.KAFKA_BROKER_STORAGE_UTILIZATION,
    });
    return target;
  }

  private createMskCluster(scope: Construct, props: Props) {
    const { vpc, clusterName } = props;

    const mskSecurityGroup = createMSKSecurityGroup(this, vpc);
    this.mskSecurityGroup = mskSecurityGroup;

    const logBucket = createMSKLoggingBucket(this);
    const mskConfig = this.createMskConfig(props);

    const mskCluster = new msk.Cluster(this, "msk-cluster", {
      clusterName,
      //Number of brokers in each AZ, default 1
      numberOfBrokerNodes: props.mskSetting.numberOfBrokerNodesPerAz,
      kafkaVersion: MSKClusterConstruct.KAFKA_VERSION,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.M5,
        props.mskSetting.instanceSize
      ),
      vpc,
      vpcSubnets: getServiceSubnets(vpc, "msk.Cluster").selectedSubnets,
      encryptionInTransit: {
        clientBroker: msk.ClientBrokerEncryption.PLAINTEXT,
      },
      securityGroups: [mskSecurityGroup],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      configurationInfo: {
        arn: mskConfig.arn,
        revision: mskConfig.version,
      },
      ebsStorageInfo: {
        volumeSize: props.mskSetting.ebsVolumeSize,
      },
      logging: {
        s3: {
          bucket: logBucket,
        },
      },
    });
    mskCluster.node.addDependency(mskConfig.mskConfiguration);
    mskCluster.node.addDependency(logBucket);
    mskCluster.node.addDependency(mskSecurityGroup);

    this.addStorageAutoScaling(props, mskCluster);

    this.createTopic(scope, props, {
      mskSecurityGroup,
      mskCluster,
    });

    new cdk.CfnOutput(this, "MSKSecurityGroupId", {
      value: mskSecurityGroup.securityGroupId,
      description: "MSK Security Group Id",
    });

    new cdk.CfnOutput(this, "ConfigRevision", {
      value: cdk.Token.asString(mskConfig.version),
    });

    new cdk.CfnOutput(this, "MskLogBucket", {
      value: logBucket.bucketName,
    });

    new cdk.CfnOutput(this, "MskClusterArn", {
      value: mskCluster.clusterArn,
    });
    this.bootstrapBrokers = mskCluster.bootstrapBrokers;
    this.mskCluster = mskCluster;
  }
}
