import { api } from '@/trpc/react'
import React from 'react'
import {useLocalStorage} from 'usehooks-ts'

const useProject = () => {
  const { data: projects, isLoading } = api.project.getProjects.useQuery()
  const [projectId, setProjectId] = useLocalStorage('githubSaaS-projectId', '')    //useLocalStorage is a custom hook that allows you to store data in local storage, as compared to useState which only stores data in memory
  const project = projects?.find((project) => project.id === projectId) //find the project that matches the projectId in local storage
  return {
    projects,
    project,
    projectId,
    setProjectId,
    isLoading,
  }
}

export default useProject