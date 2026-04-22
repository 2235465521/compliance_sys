import { useState, useEffect } from 'react';
import { useComplianceStore } from '@/stores/compliance';
import {
  getComplianceTasks,
  getComplianceTask,
  createComplianceTask,
  updateComplianceTask,
  deleteComplianceTask
} from '@/services/compliance';
import { ComplianceTask, CreateComplianceTaskRequest } from '@/types/compliance';

export function useComplianceTasks() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tasks, setTasks, setIsLoading, setError: storeSetError } = useComplianceStore();

  // 加载任务列表
  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getComplianceTasks();
      setTasks(response.data);
    } catch (err) {
      const errorMessage = (err as Error).message || '加载任务失败';
      setError(errorMessage);
      storeSetError(errorMessage);
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  // 创建任务
  const createTask = async (data: CreateComplianceTaskRequest) => {
    try {
      setIsLoading(true);
      const response = await createComplianceTask(data);
      await fetchTasks(); // 刷新任务列表
      return response.data;
    } catch (err) {
      const errorMessage = (err as Error).message || '创建任务失败';
      setError(errorMessage);
      storeSetError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // 更新任务
  const updateTask = async (id: string, data: Partial<ComplianceTask>) => {
    try {
      setIsLoading(true);
      const response = await updateComplianceTask(id, data);
      await fetchTasks(); // 刷新任务列表
      return response.data;
    } catch (err) {
      const errorMessage = (err as Error).message || '更新任务失败';
      setError(errorMessage);
      storeSetError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // 删除任务
  const deleteTask = async (id: string) => {
    try {
      setIsLoading(true);
      await deleteComplianceTask(id);
      await fetchTasks(); // 刷新任务列表
    } catch (err) {
      const errorMessage = (err as Error).message || '删除任务失败';
      setError(errorMessage);
      storeSetError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    fetchTasks();
  }, []);

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask
  };
}

export function useComplianceTask(taskId: string) {
  const [task, setTask] = useState<ComplianceTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setCurrentTask, setIsLoading, setError: storeSetError } = useComplianceStore();

  // 加载任务详情
  const fetchTask = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getComplianceTask(taskId);
      setTask(response.data);
      setCurrentTask(response.data);
    } catch (err) {
      const errorMessage = (err as Error).message || '加载任务详情失败';
      setError(errorMessage);
      storeSetError(errorMessage);
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    if (taskId) {
      fetchTask();
    }
  }, [taskId]);

  return {
    task,
    loading,
    error,
    fetchTask
  };
}