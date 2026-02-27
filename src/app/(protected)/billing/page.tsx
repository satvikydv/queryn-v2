'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { api } from '@/trpc/react'
import { CreditCard, Info, Zap } from 'lucide-react'
import React from 'react'
import { toast } from 'sonner'

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: {
    name?: string;
    email?: string;
  };
  theme?: {
    color?: string;
  };
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (response: { error: { description: string } }) => void): void;
}

interface OrderResponse {
  keyId: string;
  amount: number;
  currency: string;
  orderId: string;
  error?: string;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const BillingPage = () => {
    const { data: user, refetch } = api.project.getMyCredits.useQuery()
    const [creditsToBuy, setCreditsToBuy] = React.useState<number[]>([20])
    const [isLoading, setIsLoading] = React.useState(false)
    const creditsToBuyAmount = creditsToBuy[0]!
    const pricePerCredit = 0.75 // price per credit in INR
    const totalPrice = creditsToBuyAmount * pricePerCredit

    React.useEffect(() => {
      // Load Razorpay script
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.body.appendChild(script)

      return () => {
        if (document.body.contains(script)) {
          document.body.removeChild(script)
        }
      }
    }, [])

    const createCheckoutSession = async (credits: number) => {
      setIsLoading(true)
      try {
        const amount = credits * pricePerCredit

        // Create order
        const response = await fetch('/api/razorpay/create-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            credits,
          }),
        })

        const order = await response.json() as OrderResponse

        if (!response.ok) {
          throw new Error(order.error ?? 'Failed to create order')
        }

        // Initialize Razorpay
        const options = {
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: 'GitHub AI',
          description: `Purchase ${credits} credits`,
          order_id: order.orderId,
          handler: async function (response: RazorpayResponse) {
            try {
              // Verify payment
              const verifyResponse = await fetch('/api/razorpay/verify', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  credits: credits,
                }),
              })

              const verifyResult = await verifyResponse.json() as { error?: string }

              if (verifyResponse.ok) {
                toast.success(`Successfully purchased ${credits} credits!`)
                void refetch() // Refresh user credits
                setIsLoading(false)
              } else {
                toast.error(verifyResult.error ?? 'Payment verification failed')
                setIsLoading(false)
              }
            } catch (error) {
              toast.error('Payment verification failed')
              console.error('Verification error:', error)
              setIsLoading(false)
            }
          },
          prefill: {
            name: user?.firstName ?? '',
            email: user?.email ?? '',
          },
          theme: {
            color: '#3B82F6',
          },
          modal: {
            ondismiss: function() {
              setIsLoading(false)
            }
          }
        }

        const razorpay = new window.Razorpay(options)
        razorpay.open()

        razorpay.on('payment.failed', function (response: { error: { description: string } }) {
          toast.error('Payment failed. Please try again.')
          console.error('Payment failed:', response.error)
          setIsLoading(false)
        })

      } catch (error) {
        toast.error('Failed to create checkout session')
        console.error('Checkout error:', error)
        setIsLoading(false)
      }
    }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className='text-3xl font-bold tracking-tight'>Billing & Credits</h1>
        <p className='text-muted-foreground'>
          Manage your credits and billing information
        </p>
      </div>

      {/* Current Credits Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Current Balance
          </CardTitle>
          <CardDescription>
            Your available credits for indexing repositories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-primary">
            {user?.credits || 0} Credits
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Each credit allows you to index 1 file in a repository
          </p>
        </CardContent>
      </Card>

      {/* Purchase Credits Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-500" />
            Purchase Credits
          </CardTitle>
          <CardDescription>
            Buy credits to index more files in your repositories
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  How credits work
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Each credit allows you to index 1 file. For example, if your project has 100 files, you&apos;ll need 100 credits to fully index it.
                </p>
              </div>
            </div>
          </div>

          {/* Credit Selection */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Select number of credits
              </label>
              <div className="px-3">
                <Slider
                  value={creditsToBuy}
                  onValueChange={setCreditsToBuy}
                  max={1000}
                  min={20}
                  step={10}
                  className="w-full"
                />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>20 credits</span>
                <span>1000 credits</span>
              </div>
            </div>

            {/* Price Display */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
              <div className="text-center space-y-2">
                <div className="text-4xl font-bold text-purple-700 dark:text-purple-300">
                  {creditsToBuyAmount} Credits
                </div>
                <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  ₹{totalPrice.toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">
                  ₹{pricePerCredit} per credit
                </div>
              </div>
            </div>

            {/* Purchase Button */}
            <Button 
              onClick={() => createCheckoutSession(creditsToBuyAmount)}
              disabled={isLoading || creditsToBuyAmount < 20}
              size="lg"
              className="w-full"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Buy {creditsToBuyAmount} Credits for ₹{totalPrice.toFixed(2)}
                </>
              )}
            </Button>

            {creditsToBuyAmount < 20 && (
              <p className="text-sm text-red-500 text-center">
                Minimum purchase is 20 credits
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pricing Info */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing Information</CardTitle>
          <CardDescription>
            Simple and transparent pricing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">₹
                {pricePerCredit}
              </div>
              <div className="text-sm text-muted-foreground">Per Credit</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">20</div>
              <div className="text-sm text-muted-foreground">Minimum Purchase</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-purple-600">1000</div>
              <div className="text-sm text-muted-foreground">Maximum Purchase</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default BillingPage
