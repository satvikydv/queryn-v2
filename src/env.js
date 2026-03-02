import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    RAZORPAY_KEY_ID: z.string(),
    RAZORPAY_KEY_SECRET: z.string(),
    RAZORPAY_WEBHOOK_SECRET: z.string(),
    // AWS Core
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    AWS_REGION: z.string().default("us-east-1"),
    // Amazon Bedrock
    AWS_BEDROCK_TEXT_MODEL_ID: z.string().default("amazon.nova-pro-v1:0"),
    AWS_BEDROCK_HAIKU_MODEL_ID: z.string().default("amazon.nova-lite-v1:0"),
    AWS_BEDROCK_EMBEDDING_MODEL_ID: z.string().default("amazon.titan-embed-text-v2:0"),
    // Amazon Q Business
    AMAZON_Q_APP_ID: z.string().optional(),
    // GitHub
    GITHUB_TOKEN: z.string().optional(),
    // Zoom
    ZOOM_JWT_TOKEN: z.string().optional(),
    ZOOM_WEBHOOK_SECRET: z.string().optional(),
    // Low balance threshold (credits)
    LOW_BALANCE_THRESHOLD: z.coerce.number().default(20),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    // AWS Core
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    // Amazon Bedrock
    AWS_BEDROCK_TEXT_MODEL_ID: process.env.AWS_BEDROCK_TEXT_MODEL_ID,
    AWS_BEDROCK_HAIKU_MODEL_ID: process.env.AWS_BEDROCK_HAIKU_MODEL_ID,
    AWS_BEDROCK_EMBEDDING_MODEL_ID: process.env.AWS_BEDROCK_EMBEDDING_MODEL_ID,
    // Amazon Q Business
    AMAZON_Q_APP_ID: process.env.AMAZON_Q_APP_ID,
    // GitHub
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    // Zoom
    ZOOM_JWT_TOKEN: process.env.ZOOM_JWT_TOKEN,
    ZOOM_WEBHOOK_SECRET: process.env.ZOOM_WEBHOOK_SECRET,
    // Low balance threshold
    LOW_BALANCE_THRESHOLD: process.env.LOW_BALANCE_THRESHOLD,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
