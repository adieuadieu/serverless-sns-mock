function done(error, result) {
  process.send({
    error: error && {
      constructor: { name: error.constructor.name },
      message: error.message,
      stack: error.stack,
    },
    result,
  })

  process.exit(0)
}

process.on(
  'message',
  ({ functionName, file, method, event, timeout = 30000 }) => {
    try {
      const handler = require(file)[method]

      const endTime = new Date().getTime() + timeout

      const context = {
        done,
        fail: error => done(error, null),
        succeed: response => done(null, response),

        getRemainingTimeInMillis: () => endTime - new Date().getTime(),

        /* Properties */
        awsRequestId: `fake_awsRequestId_1`,
        clientContext: {},
        functionName,
        functionVersion: `fake_functionVersion_for_${functionName}`,
        identity: {},
        invokedFunctionArn: `fake_invokedFunctionArn_for_${functionName}`,
        logGroupName: `fake_logGroupName_for_${functionName}`,
        logStreamName: `fake_logStreamName_for_${functionName}`,
        memoryLimitInMB: 1,
      }

      const result = handler(event, context, done)

      if (result && typeof result.then === 'function') {
        result.then(context.succeed).catch(context.fail)
      } else if (result instanceof Error) {
        context.fail(result)
      }
    } catch (error) {
      done(error)
    }
  }
)
