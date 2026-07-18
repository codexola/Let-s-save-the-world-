/**
 * External integrations — leave keys empty for local demo mode.
 * When a key is set, the matching provider is used instead of the built-in mock.
 */
export const config = {
  app: {
    name: "MedCare",
    url: process.env.APP_URL || "http://localhost:3200",
    jwtSecret: process.env.JWT_SECRET || "medcare-dev-secret-change-in-production",
  },

  /** OAuth — real providers when keys set; demo mode works without keys */
  oauth: {
    demoMode: process.env.OAUTH_DEMO_MODE !== "false",
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID || "",
      teamId: process.env.APPLE_TEAM_ID || "",
      keyId: process.env.APPLE_KEY_ID || "",
      privateKey: process.env.APPLE_PRIVATE_KEY || "",
      enabled: Boolean(
        process.env.APPLE_CLIENT_ID &&
          process.env.APPLE_TEAM_ID &&
          process.env.APPLE_KEY_ID &&
          process.env.APPLE_PRIVATE_KEY
      ),
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID || "",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
      tenant: process.env.MICROSOFT_TENANT_ID || "common",
      enabled: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    },
    line: {
      channelId: process.env.LINE_CHANNEL_ID || "",
      channelSecret: process.env.LINE_CHANNEL_SECRET || "",
      enabled: Boolean(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET),
    },
  },

  /** AI Medical Consultant — OpenAI when key present, else local triage rules */
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    enabled: Boolean(process.env.OPENAI_API_KEY),
  },

  /** Payments — Stripe when keys present, else mock checkout */
  payments: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    enabled: Boolean(process.env.STRIPE_SECRET_KEY),
  },

  /** Telemedicine video — Daily.co or Agora when keys present */
  video: {
    dailyApiKey: process.env.DAILY_API_KEY || "",
    agoraAppId: process.env.AGORA_APP_ID || "",
    agoraAppCertificate: process.env.AGORA_APP_CERTIFICATE || "",
    provider: process.env.VIDEO_PROVIDER || (process.env.DAILY_API_KEY ? "daily" : process.env.AGORA_APP_ID ? "agora" : "mock"),
  },

  /** Notifications — real SMTP/Twilio/LINE when configured */
  notifications: {
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
      from: process.env.SMTP_FROM || "noreply@medcare.local",
      enabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || "",
      authToken: process.env.TWILIO_AUTH_TOKEN || "",
      from: process.env.TWILIO_FROM_NUMBER || "",
      enabled: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    },
    lineMessaging: {
      channelAccessToken: process.env.LINE_MESSAGING_TOKEN || "",
      enabled: Boolean(process.env.LINE_MESSAGING_TOKEN),
    },
    mode: process.env.SMTP_MODE || "inbox", // inbox | smtp
  },

  /** Object storage for medical docs / blog photos */
  storage: {
    s3Bucket: process.env.S3_BUCKET || "",
    s3Region: process.env.S3_REGION || "",
    s3AccessKey: process.env.S3_ACCESS_KEY_ID || "",
    s3SecretKey: process.env.S3_SECRET_ACCESS_KEY || "",
    enabled: Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID),
  },
} as const;

export function integrationStatus() {
  return {
    oauth: {
      google: config.oauth.google.enabled || config.oauth.demoMode,
      apple: config.oauth.apple.enabled || config.oauth.demoMode,
      microsoft: config.oauth.microsoft.enabled || config.oauth.demoMode,
      line: config.oauth.line.enabled || config.oauth.demoMode,
      demoMode: config.oauth.demoMode,
      live: {
        google: config.oauth.google.enabled,
        apple: config.oauth.apple.enabled,
        microsoft: config.oauth.microsoft.enabled,
        line: config.oauth.line.enabled,
      },
    },
    ai: config.ai.enabled ? "openai" : "local-rules",
    payments: config.payments.enabled ? "stripe" : "mock",
    video: config.video.provider,
    email: config.notifications.smtp.enabled ? "smtp" : "inbox",
    sms: config.notifications.twilio.enabled ? "twilio" : "inbox",
    storage: config.storage.enabled ? "s3" : "url-only",
  };
}
