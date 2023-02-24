import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ServiceType, TierType } from "./stack-main";
import {
  EcsEc2NginxAndVectorAsgSetting,
  EcsEc2NginxAsgSetting,
  EcsEc2ServerAsgSetting,
  EcsFargateSetting,
} from "./ecs";
import { KinesisSetting } from "./kinesis";
import { MSKSetting, S3SinkConnectorSetting } from "./construct-msk";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { SOLUTION } from "./constant";
import { LambdaSetting } from "./consturct-ingest-lambda-server";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
export class AppConfig {
  static solutionShortName(): string {
    return SOLUTION.SHORT_NAME;
  }

  static serverEndpointPath(scope: Construct): string {
    return scope.node.tryGetContext("EndpointPath") || "/collect";
  }

  static serverHttpEndpointPort(): number {
    return 80;
  }

  private scope: Construct;
  private props: {
    tier: TierType;
    serviceType?: ServiceType;
  };

  constructor(
    scope: Construct,
    props: {
      tier: TierType;
      serviceType?: ServiceType;
    }
  ) {
    this.scope = scope;
    this.props = props;
  }

  getTier(): TierType {
    return this.props.tier;
  }

  getServiceType(): ServiceType {
    return this.props.serviceType || ServiceType.ECS_EC2_NGINX_VECTOR;
  }

  getMskTopic(): string {
    const mskTopic = `${Stack.of(this.scope).stackName}-topic`;
    return mskTopic;
  }

  getMskSinkConnectorSetting(): S3SinkConnectorSetting {
    return {
      LARGE: {
        maxWorkerCount: 5,
        minWorkerCount: 1,
        workerMcuCount: 1,
      },
      MEDIUM: {
        maxWorkerCount: 4,
        minWorkerCount: 1,
        workerMcuCount: 1,
      },
      SMALL: {
        maxWorkerCount: 3,
        minWorkerCount: 1,
        workerMcuCount: 1,
      },
      XSMALL: {
        maxWorkerCount: 2,
        minWorkerCount: 1,
        workerMcuCount: 1,
      },
    }[this.getTier()];
  }

  getMskSetting(): MSKSetting {
    return {
      LARGE: {
        instanceSize: ec2.InstanceSize.XLARGE2, // kafka.m5.2xlarge
        numberOfBrokerNodesPerAz: 6,
        topicPartitionCount: 12,
        ebsVolumeSize: 1000,
        dataRetentionHours: 120,
      },
      MEDIUM: {
        instanceSize: ec2.InstanceSize.XLARGE2, // kafka.m5.2xlarge
        numberOfBrokerNodesPerAz: 6,
        topicPartitionCount: 12,
        ebsVolumeSize: 1000,
        dataRetentionHours: 120,
      },
      SMALL: {
        instanceSize: ec2.InstanceSize.XLARGE, // kafka.m5.xlarge
        numberOfBrokerNodesPerAz: 6,
        topicPartitionCount: 12,
        ebsVolumeSize: 1000,
        dataRetentionHours: 120,
      },
      XSMALL: {
        instanceSize: ec2.InstanceSize.LARGE, // kafka.m5.large
        numberOfBrokerNodesPerAz: 6,
        topicPartitionCount: 12,
        ebsVolumeSize: 1000,
        dataRetentionHours: 120,
      },
    }[this.getTier()];
  }

  getKinesisSetting(): KinesisSetting {
    const streamMode = kinesis.StreamMode.ON_DEMAND;
    return {
      LARGE: {
        streamMode,
        //shardCount: 128,
        dataRetentionHours: 120,
      },
      MEDIUM: {
        streamMode,
        //shardCount: 64,
        dataRetentionHours: 120,
      },
      SMALL: {
        streamMode,
        //shardCount: 32,
        dataRetentionHours: 120,
      },
      XSMALL: {
        streamMode,
        //shardCount: 12,
        dataRetentionHours: 120,
      },
    }[this.getTier()];
  }

  getEcsFargateSetting(): EcsFargateSetting {
    const attachEFS = true;
    const taskCpu = 2 * 1024;
    const taskMemoryLimitMiB = 4 * 1024;
    const nginxCpu = 256;
    const vectorCpu = taskCpu - 256;
    let vectorThreads = 6;
    const stackName = `${Stack.of(this.scope).stackName}`;
    const vectorStreamAckEnable = stackName.indexOf("batch") == -1;
    const useArm = stackName.indexOf("arm") > 0;
    if (useArm) {
      vectorThreads = 1;
    }

    const vectorRequireHealthy = false;
    const nginxWorkerConnections = 1024;

    return {
      LARGE: {
        ecsTaskMinCapacity: 8,
        ecsTaskMaxCapacity: 8,
        taskCpu,
        taskMemoryLimitMiB,
        nginxCpu,
        vectorCpu,
        attachEFS,
        useArm,
        nginxWorkerConnections,
        vectorSetting: {
          vectorThreads,
          vectorStreamAckEnable,
          vectorRequireHealthy,
        },
      },

      MEDIUM: {
        ecsTaskMinCapacity: 4,
        ecsTaskMaxCapacity: 4,
        taskCpu,
        taskMemoryLimitMiB,
        nginxCpu,
        vectorCpu,
        attachEFS,
        useArm,
        nginxWorkerConnections,
        vectorSetting: {
          vectorThreads,
          vectorStreamAckEnable,
          vectorRequireHealthy,
        },
      },

      SMALL: {
        ecsTaskMinCapacity: 2,
        ecsTaskMaxCapacity: 2,
        taskCpu,
        taskMemoryLimitMiB,
        nginxCpu,
        vectorCpu,
        attachEFS,
        useArm,
        nginxWorkerConnections,
        vectorSetting: {
          vectorThreads,
          vectorStreamAckEnable,
          vectorRequireHealthy,
        },
      },

      XSMALL: {
        ecsTaskMinCapacity: 1,
        ecsTaskMaxCapacity: 1,
        taskCpu,
        taskMemoryLimitMiB,
        nginxCpu,
        vectorCpu,
        attachEFS,
        useArm,
        nginxWorkerConnections,
        vectorSetting: {
          vectorThreads,
          vectorStreamAckEnable,
          vectorRequireHealthy,
        },
      },
    }[this.getTier()];
  }

  getEcsEc2LuaNginxAsgSetting(): EcsEc2NginxAsgSetting {
    // Notice: LuaNginxAsg cannot only work on ARM
    // Get error on Arm: Segmentation fault (core dumped)

    const c6g_large = "c6g.large";
    const c6i_large = "c6i.large";

    const instanceType = c6i_large;
    const isArm = false;
    const nginxCpu = 2 * 1024;
    const nginxWorkerConnections = 10240;

    return {
      LARGE: {
        ec2MinCapacity: 8,
        ec2MaxCapacity: 8,
        ecsTaskMinCapacity: 8,
        ecsTaskMaxCapacity: 8,
        instanceType,
        isArm,
        nginxCpu,
        nginxWorkerConnections,
      },
      MEDIUM: {
        ec2MinCapacity: 4,
        ec2MaxCapacity: 4,
        ecsTaskMinCapacity: 4,
        ecsTaskMaxCapacity: 4,
        instanceType,
        isArm,
        nginxCpu,
        nginxWorkerConnections,
      },
      SMALL: {
        ec2MinCapacity: 2,
        ec2MaxCapacity: 2,
        ecsTaskMinCapacity: 2,
        ecsTaskMaxCapacity: 2,
        instanceType,
        isArm,
        nginxCpu,
        nginxWorkerConnections,
      },
      XSMALL: {
        ec2MinCapacity: 1,
        ec2MaxCapacity: 1,
        ecsTaskMinCapacity: 1,
        ecsTaskMaxCapacity: 1,
        instanceType,
        isArm,
        nginxCpu,
        nginxWorkerConnections,
      },
    }[this.getTier()];
  }

  getEcsEc2JavaServerAsgSetting(): EcsEc2ServerAsgSetting {
    // Nginx Log server
    const c6g_large = "c6g.large";
    const c6i_large = "c6i.large";

    const instanceType = c6i_large;
    const isArm = false;
    const cpu = 2 * 1024;
    const attachEFS = false;
    const rootEbsVolume = 100;

    return {
      LARGE: {
        ec2MinCapacity: 8,
        ec2MaxCapacity: 8,
        ecsTaskMinCapacity: 8,
        ecsTaskMaxCapacity: 8,
        instanceType,
        isArm,
        cpu,
        attachEFS,
        rootEbsVolume,
      },
      MEDIUM: {
        ec2MinCapacity: 4,
        ec2MaxCapacity: 4,
        ecsTaskMinCapacity: 4,
        ecsTaskMaxCapacity: 4,
        instanceType,
        isArm,
        cpu,
        attachEFS,
        rootEbsVolume,
      },
      SMALL: {
        ec2MinCapacity: 2,
        ec2MaxCapacity: 2,
        ecsTaskMinCapacity: 2,
        ecsTaskMaxCapacity: 2,
        instanceType,
        isArm,
        cpu,
        attachEFS,
        rootEbsVolume,
      },
      XSMALL: {
        ec2MinCapacity: 1,
        ec2MaxCapacity: 1,
        ecsTaskMinCapacity: 1,
        ecsTaskMaxCapacity: 1,
        instanceType,
        isArm,
        cpu,
        attachEFS,
        rootEbsVolume,
      },
    }[this.getTier()];
  }

  getEcsEc2NginxLogAsgSetting(): EcsEc2NginxAsgSetting {
    // Nginx Log server
    const c6g_large = "c6g.large";
    const c6i_large = "c6i.large";

    const instanceType = c6i_large;
    const isArm = false;
    const nginxCpu = 2 * 1024;
    const attachEFS = Stack.of(this.scope).stackName.indexOf("efs") > 0;
    const rootEbsVolume = 100;
    const nginxWorkerConnections = 1024;
    return {
      LARGE: {
        ec2MinCapacity: 8,
        ec2MaxCapacity: 8,
        ecsTaskMinCapacity: 8,
        ecsTaskMaxCapacity: 8,
        instanceType,
        isArm,
        nginxCpu,
        attachEFS,
        rootEbsVolume,
        nginxWorkerConnections,
      },
      MEDIUM: {
        ec2MinCapacity: 4,
        ec2MaxCapacity: 4,
        ecsTaskMinCapacity: 4,
        ecsTaskMaxCapacity: 4,
        instanceType,
        isArm,
        nginxCpu,
        attachEFS,
        rootEbsVolume,
        nginxWorkerConnections,
      },
      SMALL: {
        ec2MinCapacity: 2,
        ec2MaxCapacity: 2,
        ecsTaskMinCapacity: 2,
        ecsTaskMaxCapacity: 2,
        instanceType,
        isArm,
        nginxCpu,
        attachEFS,
        rootEbsVolume,
        nginxWorkerConnections,
      },
      XSMALL: {
        ec2MinCapacity: 1,
        ec2MaxCapacity: 1,
        ecsTaskMinCapacity: 1,
        ecsTaskMaxCapacity: 1,
        instanceType,
        isArm,
        nginxCpu,
        attachEFS,
        rootEbsVolume,
        nginxWorkerConnections,
      },
    }[this.getTier()];
  }

  getEcsEc2NginxAndVectorAsgSetting(): EcsEc2NginxAndVectorAsgSetting {
    // c6gn.2xlarge	$0.3456 - Network: Up to 25 Gigabit - EBS: Up to 9.5
    // c6gn.medium	$0.0432 - Network: Up to 25 Gigabit - EBS: Up to 9.5
    // c6g.2xlarge	$0.272  - Network: Up to 16 - EBS: Up to 4.75
    // c6g.medium	  $0.034  - Network: Up to 10 - EBS: Up to 4.75

    const c6g_large = "c6g.large"; // 2 vcp, 4 G mem
    const c6i_large = "c6i.large";
    const c6i_2xlarge = "c6i.2xlarge"; // 8 vcp, 16 G mem

    const stackName = `${Stack.of(this.scope).stackName}`;
    let vectorThreads = 6;
    let vectorCpu = 1792; //1792 - 128;
    let nginxCpu = 256;
    let instanceType = c6i_large;

    const isArm = stackName.indexOf("arm") > 0;
    if (isArm) {
      instanceType = c6g_large;
      vectorThreads = 1;
    }
    const vectorStreamAckEnable = stackName.indexOf("batch") == -1;
    const vectorRequireHealthy = false;
    let nginxWorkerConnections = 1024;

    const matchedEls = stackName.match(/-cpu(\d+)t(\d)-n(\d+)/);
    if (matchedEls) {
      vectorCpu = Number.parseInt(matchedEls[1]);
      vectorThreads = Number.parseInt(matchedEls[2]);
      nginxCpu = Number.parseInt(matchedEls[3]);
    }

    if (stackName.indexOf("kinesis") > 0) {
      nginxWorkerConnections = 100;
    }

    return {
      LARGE: {
        ec2MinCapacity: 2,
        ec2MaxCapacity: 2,
        ecsTaskMinCapacity: 2,
        ecsTaskMaxCapacity: 2,
        instanceType: c6i_2xlarge,
        isArm,
        vectorCpu: 7936,
        nginxCpu: 256,
        nginxWorkerConnections: nginxWorkerConnections * 4,
        vectorSetting: {
          vectorThreads: -1,
          vectorStreamAckEnable,
          vectorRequireHealthy,
        },
      },
      MEDIUM: {
        ec2MinCapacity: 4,
        ec2MaxCapacity: 4,
        ecsTaskMinCapacity: 4,
        ecsTaskMaxCapacity: 4,
        instanceType,
        isArm,
        vectorCpu,
        nginxCpu,
        nginxWorkerConnections,
        vectorSetting: {
          vectorThreads,
          vectorStreamAckEnable,
          vectorRequireHealthy,
        },
      },
      SMALL: {
        ec2MinCapacity: 2,
        ec2MaxCapacity: 2,
        ecsTaskMinCapacity: 2,
        ecsTaskMaxCapacity: 2,
        instanceType,
        isArm,
        vectorCpu,
        nginxCpu,
        nginxWorkerConnections,
        vectorSetting: {
          vectorThreads,
          vectorStreamAckEnable,
          vectorRequireHealthy,
        },
      },
      XSMALL: {
        ec2MinCapacity: 1,
        ec2MaxCapacity: 1,
        ecsTaskMinCapacity: 1,
        ecsTaskMaxCapacity: 1,
        instanceType,
        isArm,
        vectorCpu,
        nginxCpu,
        nginxWorkerConnections,
        vectorSetting: {
          vectorThreads,
          vectorStreamAckEnable,
          vectorRequireHealthy,
        },
      },
    }[this.getTier()];
  }

  getLambdaServerSetting(): LambdaSetting {
    return {
      memorySize: 1024,
      timeoutSec: 60,
    };
  }
}
