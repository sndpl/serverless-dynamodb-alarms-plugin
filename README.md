Create Cloudwatch alarms for all DynamoDB tables' read and write capacity.

Usage
===

In Serverless template:

```
plugins:
  - serverless-dynamodb-alarms-plugin

custom:
  ddbAlarms:
    readCapacityAlarmThreshold: 3000
    writeCapacityAlarmThreshold: 3000
    period: 60
    evaluationPeriods: 1
    topicName: snsNotificationTopic
    filter:
      - "*"
```

Match only listed tables:

```
custom:
  ddbAlarms:
    readCapacityAlarmThreshold: 3000
    writeCapacityAlarmThreshold: 3000
    period: 60
    evaluationPeriods: 1
    topicName: snsNotificationTopic
    filter:
      - Exmaple1Table
      - Example2Table
```
