/** 与后端约定的通用响应结构可在对接 API 时补充 */
export type ApiResult<T> = {
  data: T
}
