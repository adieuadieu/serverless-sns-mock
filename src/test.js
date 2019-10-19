const AWS = require('aws-sdk')

const sns = new AWS.SNS({
  endpoint: 'http://localhost:3030/',
  region: 'local',
  accessKeyId: 'foobar',
  secretAccessKey: 'foobar',
})

async function main() {
  const result = await sns
    .publish({
      Message: 'hello!',
      MessageStructure: 'json',
      TopicArn: 'arn:aws:sns:eu-west-1:123456789012:test-topic',
    })
    .promise()

  console.log('result', result)
}

main().catch(error => console.error('error', error))
