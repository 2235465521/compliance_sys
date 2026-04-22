/** 后端通用响应结构：{ code, msg, data } */
export interface ApiResult<T> {
  code: number
  msg: string
  data: T
}

/** 分页列表响应结构（对应 DRF ModelViewSet list 接口）*/
export interface PaginatedResult<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
