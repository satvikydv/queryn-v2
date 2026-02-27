import Razorpay from 'razorpay';

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export const RAZORPAY_CONFIG = {
  key_id: process.env.RAZORPAY_KEY_ID!,
  webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET!,
} as const;
