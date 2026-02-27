import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Clock } from 'lucide-react'  
import { Badge } from '@/components/ui/badge'

const MeetingsPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              Coming Soon
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
              Meetings
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              We&apos;re building something amazing for your team meetings. Stay tuned!
            </p>
          </div>

          {/* Coming Soon Card */}
          <Card className="border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-800/50 backdrop-blur">
            <CardContent className="text-center py-16">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="w-10 h-10 text-white animate-pulse" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                We're Working Hard!
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-md mx-auto">
                Our team is putting the finishing touches on the meetings feature. 
                It will be available very soon.
              </p>
              <div className="flex justify-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default MeetingsPage
