import { useState, useEffect } from 'react'
import { useComplianceStore } from '@/stores/compliance'
import {
  getComplianceTasks,
  getComplianceTask,
  createComplianceTask,
  updateComplianceTask,
  deleteComplianceTask,
} from '@/services/compliance'
import type { ComplianceTask, CreateComplianceTaskRequest } from '@/types/compliance'

/**
 * 合规任务列表/CRUD hooks（数据来自新后端 `/api/v1/compliance`，经 `services/compliance` 适配）。
 */

export function useComplianceTasks() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { tasks, setTasks, setIsLoading, setError: storeSetError } = useComplianceStore()

  const fetchTasks = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getComplianceTasks()
      setTasks(response.data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载任务失败'
      setError(errorMessage)
      storeSetError(errorMessage)
    } finally {
      setLoading(false)
      setIsLoading(false)
    }
  }

  const createTask = async (data: CreateComplianceTaskRequest) => {
    try {
      setIsLoading(true)
      const response = await createComplianceTask(data)
      await fetchTasks()
      return response.data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建任务失败'
      setError(errorMessage)
      storeSetError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const updateTask = async (id: string, data: Partial<ComplianceTask>) => {
    try {
      setIsLoading(true)
      const response = await updateComplianceTask(id, data)
      await fetchTasks()
      return response.data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '更新任务失败'
      setError(errorMessage)
      storeSetError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const deleteTask = async (id: string) => {
    try {
      setIsLoading(true)
      await deleteComplianceTask(id)
      await fetchTasks()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '删除任务失败'
      setError(errorMessage)
      storeSetError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchTasks()
  }, [])

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
  }
}

export function useComplianceTask(taskId: string) {
  const [task, setTask] = useState<ComplianceTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { setCurrentTask, setIsLoading, setError: storeSetError } = useComplianceStore()

  const fetchTask = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getComplianceTask(taskId)
      setTask(response.data)
      setCurrentTask(response.data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载任务详情失败'
      setError(errorMessage)
      storeSetError(errorMessage)
    } finally {
      setLoading(false)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (taskId) {
      void fetchTask()
    }
  }, [taskId])

  return {
    task,
    loading,
    error,
    fetchTask,
  }
}
