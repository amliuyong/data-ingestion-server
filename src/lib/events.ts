import * as  events from 'aws-cdk-lib/aws-events';
import * as  targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as cdk from "aws-cdk-lib";
import { createServerHealthCheckLambda } from './lambda';
import * as sns from 'aws-cdk-lib/aws-sns';

export function createServerMonitorEvent(scope: Construct, serverUrl: string, sns: sns.ITopic) {
    const fn = createServerHealthCheckLambda(scope, sns.topicArn);
    sns.grantPublish(fn);
    const lambdaTarget = new targets.LambdaFunction(fn, {
        maxEventAge: cdk.Duration.hours(2), 
        retryAttempts: 3, 
        event: events.RuleTargetInput.fromObject({
            serverUrl
        })
      });
    const rule = new events.Rule(scope, 'ServerMonitorScheduleRule', {
        schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
        targets: [lambdaTarget],
       });
    return rule;
}