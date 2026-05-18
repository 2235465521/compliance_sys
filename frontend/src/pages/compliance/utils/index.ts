// 格式化任务状态显示
export function formatTaskStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '待开始',
    processing: '进行中',
    completed: '已完成',
    failed: '失败',
    analyzing: '解析中',
    reviewing: '审核中',
    comparing: '比对中'
  };
  return statusMap[status] || status;
}

// 格式化任务状态颜色
export function getTaskStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    pending: 'default',
    processing: 'processing',
    completed: 'success',
    failed: 'error',
    analyzing: 'warning',
    reviewing: 'warning',
    comparing: 'warning'
  };
  return colorMap[status] || 'default';
}

// 格式化时间
export function formatTime(time: string): string {
  if (!time) return '';
  try {
    const date = new Date(time);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (err) {
    return time;
  }
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 计算合规率
export function calculateComplianceRate(compliant: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((compliant / total) * 100);
}

// 格式化合规率显示
export function formatComplianceRate(compliant: number, total: number): string {
  const rate = calculateComplianceRate(compliant, total);
  return `${rate}% (${compliant}/${total})`;
}

// 获取合规率颜色
export function getComplianceRateColor(rate: number): string {
  if (rate >= 90) return '#52c41a'; // 绿色
  if (rate >= 70) return '#faad14'; // 黄色
  return '#ff4d4f'; // 红色
}

// 格式化指标比对结果
export function formatComparisonResult(result: string): string {
  const resultMap: Record<string, string> = {
    compliant: '合规',
    'non-compliant': '不合规',
    unknown: '未知'
  };
  return resultMap[result] || result;
}

// 获取指标比对结果颜色
export function getComparisonResultColor(result: string): string {
  const colorMap: Record<string, string> = {
    compliant: 'success',
    'non-compliant': 'error',
    unknown: 'default'
  };
  return colorMap[result] || 'default';
}

// 生成随机ID
export function generateRandomId(prefix: string = 'id'): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
}

// 深拷贝对象
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// 防抖函数
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// 验证文件类型
export function validateFileType(file: File, allowedTypes: string[]): boolean {
  const fileType = file.type;
  return allowedTypes.some(type => fileType.includes(type));
}

// 计算文件上传进度
export function calculateUploadProgress(loaded: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((loaded / total) * 100);
}

// 格式化上传进度
export function formatUploadProgress(progress: number): string {
  return `${progress}%`;
}

// 获取上传进度颜色
export function getUploadProgressColor(progress: number): string {
  if (progress === 100) return '#52c41a'; // 绿色
  return '#1890ff'; // 蓝色
}

// 格式化错误信息
export function formatErrorMessage(error: any): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else if (error?.message) {
    return error.message;
  } else {
    return '未知错误';
  }
}

// 过滤空值
export function filterEmptyValues(obj: any): any {
  const filtered: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      filtered[key] = obj[key];
    }
  }
  return filtered;
}

// 排序数组
export function sortArray<T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const valueA = a[key];
    const valueB = b[key];
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      return order === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
    } else if (typeof valueA === 'number' && typeof valueB === 'number') {
      return order === 'asc' ? valueA - valueB : valueB - valueA;
    } else {
      return 0;
    }
  });
}