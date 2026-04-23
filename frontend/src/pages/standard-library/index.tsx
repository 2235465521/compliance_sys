import { Navigate } from 'react-router-dom'

/** 进入标准库模块时直接进入「标准入库与查询」，不再提供概览页 */
export default function StandardLibraryIndexRedirect() {
  return <Navigate to="/standard-library/registry" replace />
}
