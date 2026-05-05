import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'
const sentryDsn = process.env.SENTRY_DSN

// Build transport targets dynamically. In all modes, info+ goes to stdout.
// When SENTRY_DSN is set, error+fatal also flow to Sentry via pino-sentry-transport.
const targets: any[] = []

if (isDev) {
  targets.push({
    target: 'pino-pretty',
    level: 'info',
    options: { colorize: true, translateTime: 'SYS:standard' },
  })
} else {
  targets.push({
    target: 'pino/file',
    level: 'info',
    options: { destination: 1 },
  })
}

if (sentryDsn) {
  targets.push({
    target: 'pino-sentry-transport',
    level: 'error',
    options: {
      sentry: {
        dsn: sentryDsn,
        environment: process.env.NODE_ENV ?? 'production',
      },
      minLevel: 50,
    },
  })
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: { targets },
  base: { service: 'apatris-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'body.password', 'body.token'],
    censor: '[REDACTED]',
  },
})

export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now()
  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${Date.now() - start}ms`,
      ip: req.ip,
    })
  })
  next()
}
