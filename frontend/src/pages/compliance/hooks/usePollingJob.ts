import { useState, useEffect, useRef, useCallback } from 'react';

interface UsePollingJobOptions {
  interval?: number;
  immediate?: boolean;
  onError?: (error: Error) => void;
}

export function usePollingJob<T>(
  job: () => Promise<T>,
  options: UsePollingJobOptions = {}
) {
  const { interval = 5000, immediate = true, onError } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRunning, setIsRunning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobRef = useRef(job);

  // 保存最新的job函数
  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  // 执行轮询任务
  const executeJob = useCallback(async () => {
    if (!isRunning) return;

    setLoading(true);
    setError(null);

    try {
      const result = await jobRef.current();
      setData(result);
    } catch (err) {
      const error = err as Error;
      setError(error);
      if (onError) {
        onError(error);
      }
    } finally {
      setLoading(false);
    }
  }, [isRunning, onError]);

  // 启动轮询
  const startPolling = useCallback(() => {
    setIsRunning(true);
  }, []);

  // 停止轮询
  const stopPolling = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 重新启动轮询
  const restartPolling = useCallback(() => {
    stopPolling();
    startPolling();
  }, [stopPolling, startPolling]);

  // 初始化和清理
  useEffect(() => {
    if (!isRunning) return;

    // 立即执行一次
    if (immediate) {
      executeJob();
    }

    // 设置轮询
    intervalRef.current = setInterval(executeJob, interval);

    // 清理函数
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, immediate, executeJob, interval]);

  return {
    data,
    loading,
    error,
    isRunning,
    startPolling,
    stopPolling,
    restartPolling,
    executeJob
  };
}

// 用于轮询任务状态的hook
export function useTaskStatusPolling(_taskId: string, fetchStatus: () => Promise<any>) {
  const { data: taskStatus, loading, error, isRunning, startPolling, stopPolling } = usePollingJob(
    fetchStatus,
    { interval: 10000, immediate: true }
  );

  // 当任务完成时自动停止轮询
  useEffect(() => {
    if (taskStatus && (taskStatus.status === 'completed' || taskStatus.status === 'failed')) {
      stopPolling();
    }
  }, [taskStatus, stopPolling]);

  return {
    taskStatus,
    loading,
    error,
    isRunning,
    startPolling,
    stopPolling
  };
}

// 用于轮询文件解析进度的hook
export function useFileAnalysisPolling(_fileId: string, fetchProgress: () => Promise<any>) {
  const { data: analysisProgress, loading, error, isRunning, startPolling, stopPolling } = usePollingJob(
    fetchProgress,
    { interval: 5000, immediate: true }
  );

  // 当解析完成时自动停止轮询
  useEffect(() => {
    if (analysisProgress && analysisProgress.status === 'completed') {
      stopPolling();
    }
  }, [analysisProgress, stopPolling]);

  return {
    analysisProgress,
    loading,
    error,
    isRunning,
    startPolling,
    stopPolling
  };
}