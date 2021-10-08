Create Cloudwatch alarms for all DynamoDB tables' read and write capacity.

Usage
===

In Serverless template:

```
plugins:
  - serverless-dynamodb-alarms-plugin

custom:
  dynamo-alarms:
    read:
      provisionedCapacityUnitsAlarmThreshold: 3000
      throttleEvents: 1
    write:
      provisionedCapacityUnitsAlarmThreshold: 3000
      throttleEvents: 1
    period: 60
    evaluationPeriods: 1
    topicName: snsNotificationTopic
    filter:
      - "*"
```

Match only listed tables:

```
custom:
  dynamo-alarms:
    read:
      provisionedCapacityUnitsAlarmThreshold: 3000
      throttleEvents: 1
    write:
      provisionedCapacityUnitsAlarmThreshold: 3000
      throttleEvents: 1
    period: 60
    evaluationPeriods: 1
    topicName: snsNotificationTopic
    filter:
      - Exmaple1Table
      - Example2Table
```
