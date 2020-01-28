'use strict';

const _ = require('lodash');

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.addAlarms.bind(this)
    };
  }

  findDynamoTables(resources, alarmConfig) {
    return Object.entries(resources).reduce(
        (prev, [name, properties]) => ({
          ...prev,
          ...(this.matchFilters(name, properties.Type, alarmConfig) ? { [name]: properties } : {})
        }),
        {}
    );
  }

  matchFilters(name, type, alarmConfig) {
    return type === 'AWS::DynamoDB::Table' && alarmConfig.tableNameMatches(name);
  }

  addAlarms() {
    if (!this.serverless.service.custom || !this.serverless.service.custom['dynamo-alarms']) {
      return;
    }

    const myResources = this.serverless.service.resources.Resources;
    const alarmConfig = new AlarmConfig(this.serverless.service.custom['dynamo-alarms']);

    const dynamoTables = this.findDynamoTables(myResources, alarmConfig);

    const alarms = Object.values(dynamoTables)
        .map(item => {
          const readAlarm = alarmConfig.createReadAlarm ? this.createReadAlarm(item.Properties, alarmConfig) : undefined;
          const writeAlarm = alarmConfig.createWriteAlarm ? this.createWriteAlarm(item.Properties, alarmConfig) : undefined;

          const capacityAlarmSnippet = {
            ...readAlarm,
            ...writeAlarm
          };
          this.serverless.cli.log(`Creating Cloudwatch alarms for DynamoDB table ${item.tableName}`);
          return capacityAlarmSnippet;
        });

    alarms.forEach(alarm => {
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, alarm);
    });
  }

  createReadAlarm(item, alarmConfig) {
    return this.createAlarm(item, alarmConfig, 'ReadAlarm', 'ConsumedReadCapacityUnits', alarmConfig.readCapacityAlarmThreshold);
  }

  createWriteAlarm(item, alarmConfig) {
    return this.createAlarm(item, alarmConfig, 'WriteAlarm', 'ConsumedWriteCapacityUnits', alarmConfig.writeCapacityAlarmThreshold);
  }

  createAlarm(item, alarmConfig, alarmName, metricName, threshold) {
    let alphaNumTableName = item.TableName.replace(/[^0-9a-z]/gi, '');
    return {
      [alphaNumTableName + alarmName]: {
        Type: 'AWS::CloudWatch::Alarm',
        Properties: {
          AlarmDescription: `DynamoDB capacity alarm for ${item.TableName}`,
          Namespace: 'AWS/DynamoDB',
          MetricName: metricName,
          Dimensions: [
            {
              Name: 'TableName',
              Value: item.TableName
            }
          ],
          Statistic: 'Maximum',
          Period: alarmConfig.period,
          EvaluationPeriods: alarmConfig.evaluationPeriods,
          Threshold: threshold,
          ComparisonOperator: 'GreaterThanOrEqualToThreshold',
          TreatMissingData: 'notBreaching',
          AlarmActions: [{ Ref: alarmConfig.topicName }],
          OKActions: [{ Ref: alarmConfig.topicName }]
        }
      }
    };
  }
}

class AlarmConfig {
  constructor(alarmConfig) {
    this.readCapacityAlarmThreshold = alarmConfig.readCapacityAlarmThreshold;
    this.writeCapacityAlarmThreshold = alarmConfig.writeCapacityAlarmThreshold;
    this.period = alarmConfig.period;
    this.evaluationPeriods = alarmConfig.evaluationPeriods;
    this.topicName = alarmConfig.topicName;
    this.filterRules = alarmConfig.filter;
    this.addToAll = alarmConfig.filter[0] === '*';
    this.createReadAlarm = !!alarmConfig.readCapacityAlarmThreshold;
    this.createWriteAlarm = !!alarmConfig.writeCapacityAlarmThreshold;
  }

  tableNameMatches(name) {
    return this.addToAll === true || this.filterRules.includes(name);
  }
}

module.exports = ServerlessPlugin;
