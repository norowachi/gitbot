import pino from "pino";

/**
 * Shared pino logger instance.
 *
 * In development (`NODE_ENV !== "production"`), output is piped through
 * `pino-pretty` for readable terminal output.
 *
 * In production, logs are emitted as newline-delimited JSON — ready for
 * shipping to Datadog, Logtail, Loki, or any structured log aggregator.
 *
 * Usage:
 *   import { log } from "@utils";
 *   log.info({ event: "db.connect" }, "Connected to MongoDB");
 *   log.error({ err }, "Unexpected failure");
 */
export const log = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Serialize Error objects properly
    serializers: { err: pino.stdSerializers.err },
  },
  process.env.NODE_ENV === "production"
    ? pino.destination(1) // stdout, JSON
    : (await import("pino-pretty")).build({
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      })
);

export default log;
