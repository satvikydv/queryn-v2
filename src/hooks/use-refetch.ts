import { useQueryClient } from '@tanstack/react-query'
import React from 'react'

const useRefetch = () => {
    const queryClient = useQueryClient()
    return async () => {
        await queryClient.refetchQueries({ type: 'active' }) //refetch all active queries
    }
}

export default useRefetch