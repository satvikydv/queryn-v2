import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { razorpay } from '@/lib/razorpay';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { amount, credits } = await request.json();

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100, // Amount in paise (multiply by 100)
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId,
        credits: credits.toString(),
      },
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
