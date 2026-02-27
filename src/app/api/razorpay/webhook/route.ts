import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/server/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature provided' }, { status: 400 });
    }

    // Verify the webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const payload = JSON.parse(body);

    // Handle payment success
    if (payload.event === 'payment.captured') {
      const payment = payload.payload.payment.entity;
      const order = payment.order_id;
      
      // Get order details to extract user info
      const orderDetails = await fetch(`https://api.razorpay.com/v1/orders/${order}`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
        }
      });
      
      const orderData = await orderDetails.json();
      const userId = orderData.notes.userId;
      const credits = parseInt(orderData.notes.credits);

      // Update user credits in database
      await db.user.update({
        where: { id: userId },
        data: {
          credits: {
            increment: credits
          }
        }
      });

      console.log(`Added ${credits} credits to user ${userId}`);
    }

    return NextResponse.json({ status: 'success' });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
    return new Response("Webhook is working", { status: 200 });
}