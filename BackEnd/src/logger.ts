import pino from "pino";

const logger = pino({
  name: "mytrader-backend",
  level: process.env.LOG_LEVEL?.trim() || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "authorization",
      "apiKey",
      "apiSecret",
      "password",
      "signatureBase64",
      "signedTransaction",
      "token",
      "headers.x-api-key",
    ],
    remove: true,
  },
});

export default logger;
