// Logger: pino with main-thread Sentry capture hook (Day 19 — Item 2.3 Option 2).
// Intentionally avoids pino transport: { targets } because esbuild bundles pino,
// breaking pino's __dirname-relative worker_threads spawn (Day 18 Item 2.3 Phase A finding).
// Sentry.captureException runs in main thread; pino's async-queue handles network I/O.
// Hook is wrapped in try/catch so Sentry failure never crashes calling code.
import pino from 'pino'
import * as Sentry from '@sentry/node'

const isDev = process.env.NODE_ENV !== 'production'
const sentryDsn = process.env.SENTRY_DSN

const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: { service: 'apatris-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'body.password', 'body.token'],
    censor: '[REDACTED]',
  },
}

// V8-verified: pino passes `level` to logMethod hook as a number (50=error, 60=fatal).
const sentryHook: pino.LoggerOptions = sentryDsn
  ? {
      hooks: {
        logMethod(args: any[], method: any, level: number) {
          if (level >= 50) {
            try {
              const [obj, msg] = args
              let err: Error
              if (obj?.err instanceof Error) {
                err = obj.err
              } else if (obj?.err && typeof obj.err === 'object' && obj.err.message) {
                // pino serializes Error → plain object {message, stack, type}; reconstruct.
                err = new Error(obj.err.message)
                if (obj.err.stack) err.stack = obj.err.stack
                if (obj.err.type) err.name = obj.err.type
              } else {
                err = new Error(typeof msg === 'string' ? msg : 'logger.error called')
              }
              Sentry.captureException(err, {
                extra: typeof obj === 'object' && obj !== null ? obj : undefined,
                tags: { logger_level: level === 50 ? 'error' : 'fatal' },
              })
            } catch (sentryError) {
              console.error('[Sentry hook failed]', sentryError)
            }
          }
          return method.apply(this, args)
        },
      },
    }
  : {}

export const logger = pino({ ...baseConfig, ...sentryHook })

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
