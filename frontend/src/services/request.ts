import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export const request = axios.create({
  baseURL,
  timeout: 30_000,
})

request.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error),
)

export default request
