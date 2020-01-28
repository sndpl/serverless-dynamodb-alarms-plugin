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
          const readProvCapacityAlarm = alarmConfig.createReadAlarm ? this.createReadProvCapacityAlarm(item.Properties, alarmConfig) : undefined;
          const writeProvCapacityAlarm = alarmConfig.createWriteAlarm ? this.createWriteProvCapacityAlarm(item.Properties, alarmConfig) : undefined;
          const readThrottlingAlarm = alarmConfig.createReadThrottlingAlarm ? this.createReadThrottlingAlarm(item.Properties, alarmConfig) : undefined;
          const writeThrottlingAlarm = alarmConfig.createWriteThrottlingAlarm ? this.createWriteThrottlingAlarm(item.Properties, alarmConfig) : undefined;

          const capacityAlarmSnippet = {
            ...readProvCapacityAlarm,
            ...writeProvCapacityAlarm,
            ...readThrottlingAlarm,
            ...writeThrottlingAlarm,
          };
          this.serverless.cli.log(`Creating Cloudwatch alarms for DynamoDB table ${item.tableName}`);
          return capacityAlarmSnippet;
        });

    alarms.forEach(alarm => {
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, alarm);
    });
  }

  createReadProvCapacityAlarm(item, alarmConfig) {
    return this.createAlarm(item, alarmConfig, 'ReadProvCapAlarm', 'ProvisionedReadCapacityUnits', alarmConfig.readThreshold);
  }

  createWriteProvCapacityAlarm(item, alarmConfig) {
    return this.createAlarm(item, alarmConfig, 'WriteProvCapAlarm', 'ProvisionedWriteCapacityUnits', alarmConfig.writeThreshold);
  }

  createReadThrottlingAlarm(item, alarmConfig) {
    return this.createAlarm(item, alarmConfig, 'ReadThrottleAlarm', 'ReadThrottleEvents', alarmConfig.readThrottlingThreshold);
  }

  createWriteThrottlingAlarm(item, alarmConfig) {
    return this.createAlarm(item, alarmConfig, 'WriteThrottleAlarm', 'WriteThrottleEvents', alarmConfig.writeThrottlingThreshold);
  }

  createAlarm(item, alarmConfig, alarmName, metricName, threshold) {
    let alphaNumTableName = item.TableName.replace(/[^0-9a-z]/gi, '');
    return {
      [alphaNumTableName + alarmName]: {
        Type: 'AWS::CloudWatch::Alarm',
        Properties: {
          AlarmDescription: `DynamoDB ${metricName} alarm for ${item.TableName}`,
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
  constructor(config) {
    this.createReadAlarm = !!config.read.provisionedCapacityUnitsAlarmThreshold;
    this.createWriteAlarm = !!config.write.provisionedCapacityUnitsAlarmThreshold;
    if (this.createReadAlarm) {
      this.readThreshold = config.read.provisionedCapacityUnitsAlarmThreshold;
    }
    if (this.createWriteAlarm) {
      this.writeThreshold = config.write.provisionedCapacityUnitsAlarmThreshold;
    }
    this.createReadThrottlingAlarm = !!config.read.throttleEvents;
    this.createWriteThrottlingAlarm = !!config.write.throttleEvents;

    if (this.createReadThrottlingAlarm) {
      this.readThrottlingThreshold = config.read.throttleEvents;
    }
    if (this.createWriteThrottlingAlarm) {
      this.writeThrottlingThreshold = config.write.throttleEvents;
    }
    this.period = config.period;
    this.evaluationPeriods = config.evaluationPeriods;
    this.topicName = config.topicName;
    this.filterRules = config.filter;
    this.addToAll = config.filter[0] === '*';
  }

  tableNameMatches(name) {
    return this.addToAll === true || this.filterRules.includes(name);
  }
}

module.exports = ServerlessPlugin;
