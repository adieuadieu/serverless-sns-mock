const path = require('path')
const util = require('util')
const fse = require('fs-extra')
const Koa = require('koa')
const koaBody = require('koa-body')
const yaml = require('js-yaml')
const { fork } = require('child_process')

const PORT = process.env.PORT || 3030
const SERVICES_ROOT_PATH = process.env.SERVICES_ROOT_PATH || '/repositories'

// find all lambda functions which subscribe to the event-service
async function getSubscribers() {
  const services = await fse.readdir(SERVICES_ROOT_PATH)

  return (
    services
      .filter(service =>
        fse.existsSync(
          path.resolve(`${SERVICES_ROOT_PATH}/${service}/serverless.yml`)
        )
      )
      .map(service => {
        const servicePath = path.resolve(`${SERVICES_ROOT_PATH}/${service}`)
        const { functions } = yaml.load(
          fse.readFileSync(`${servicePath}/serverless.yml`)
        )

        return (
          Object.entries(functions)
            // filter for lambda functions that have an SNS event subscription
            .filter(
              ([, value]) =>
                value.events &&
                value.events.some(event => Object.keys(event).includes('sns'))
            )
            // split the lambda handler into two parts: the javascript file
            // and the exported method to call (invoke)
            .map(([functionName, value]) => ({
              functionName,
              file: `${servicePath}/${value.handler.split('.')[0]}.js`,
              method: value.handler.split('.')[1],
              topicArns: value.events.reduce(
                (arns, item) =>
                  item.sns
                    ? [
                        ...arns,
                        item.sns.arn
                          .replace('${self:provider.region}', 'eu-west-1')
                          .replace(
                            '${self:custom.awsAccountId}',
                            '000000000000'
                          )
                          .replace('${self:provider.stage}', 'development')
                      ]
                    : arns,
                []
              )
            }))
        )
      })
      // a.k.a. flatten()
      .reduce((accumulator, item) => [...accumulator, ...item], [])
  )
}

// invoke subscriber lambda functions with simulated SNS payload
async function invokeSubscribers(subscribers = [], topicArn, data = {}) {
  const eventPayload = {
    Records: [
      {
        EventSource: 'aws:sns',
        EventVersion: '1.0',
        EventSubscriptionArn: topicArn,
        Sns: {
          Type: 'Notification',
          MessageId: '567910cd-659e-55d4-8ccb-5aaf14679dc0',
          TopicArn: topicArn,
          Subject: data.Subject,
          Message: data.Message,
          Timestamp: new Date().toISOString(),
          SignatureVersion: '1',
          Signature: 'foobar',
          SigningCertUrl: 'foobar',
          UnsubscribeUrl: 'foobar',
          MessageAttributes: data.MessageAttributes.entry.reduce(
            (accumulator, currentValue) => ({
              ...accumulator,
              [currentValue.Name]: {
                Type: currentValue.Value.DataType,
                Value: currentValue.Value.StringValue
              }
            }),
            {}
          )
        }
      }
    ]
  }

  const result = await Promise.all(
    subscribers
      // only invoke handlers which subscribe to the given topicArn
      .filter(({ topicArns }) => topicArns.includes(topicArn))
      .map(async subscriber => ({
        ...subscriber,
        response: await new Promise((resolve, reject) => {
          const lambda = fork(__dirname + '/invoke.js')

          lambda.on('message', message => resolve(message))
          lambda.on('exit', () =>
            console.log(subscriber.file, 'Invocation completed.')
          )

          lambda.on('error', error => reject(error))

          lambda.send({
            ...subscriber,
            event: eventPayload
          })
        })
      }))
  )

  console.log(util.inspect(result, { depth: Infinity }))

  return result
}

async function main() {
  const subscribers = await getSubscribers()
  const app = new Koa()

  app.use(koaBody())

  app.use(async context => {
    const { body: data } = context.request

    console.log({ data })

    // We intentionally do not await here, because it would block the response
    invokeSubscribers(subscribers, data.TopicArn, data)

    context.body = `<PublishResponse xmlns="https://sns.amazonaws.com/doc/2010-03-31/">
  <PublishResult>
      <MessageId>567910cd-659e-55d4-8ccb-5aaf14679dc0</MessageId>
  </PublishResult>
  <ResponseMetadata>
      <RequestId>d74b8436-ae13-5ab4-a9ff-ce54dfea72a0</RequestId>
  </ResponseMetadata>
</PublishResponse>`

    context.type = 'text/xml; charset=utf-8'
  })

  app.listen(PORT)

  console.log(`SNS Mock Service: listening on ${PORT}`)
}

// start/run the server.
main().catch(error => console.error('Server runtime error:', error))
