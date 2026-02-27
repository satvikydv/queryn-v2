import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/server/db';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      credits 
    } = await request.json();

    // Verify payment signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Payment is valid, update user credits
    await db.user.update({
      where: { id: userId },
      data: {
        credits: {
          increment: parseInt(credits)
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Successfully added ${credits} credits` 
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json(
      { error: 'Payment verification failed' },
      { status: 500 }
    );
  }
}
