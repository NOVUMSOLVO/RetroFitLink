import axios from 'axios';
import config from '../config/environment';

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: config.apiUrl,
  timeout: config.apiTimeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (requestConfig) => {
    const token = localStorage.getItem('token');
    if (token) {
      requestConfig.headers.Authorization = `Bearer ${token}`;
    }
    
    if (config.enableDebugLogs) {
      console.log('API Request:', {
        method: requestConfig.method,
        url: requestConfig.url,
        headers: requestConfig.headers
      });
    }
    
    return requestConfig;
  },
  (error) => {
    if (config.enableDebugLogs) {
      console.error('Request interceptor error:', error);
    }
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
apiClient.interceptors.response.use(
  (response) => {
    if (config.enableDebugLogs) {
      console.log('API Response:', {
        status: response.status,
        url: response.config.url,
        data: response.data
      });
    }
    return response;
  },
  (error) => {
    if (config.enableDebugLogs) {
      console.error('API Error:', {
        status: error.response?.status,
        url: error.config?.url,
        message: error.message,
        data: error.response?.data
      });
    }
    
    // Handle authentication errors
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    // Handle rate limiting
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      if (retryAfter) {
        console.warn(`Rate limited. Retry after ${retryAfter} seconds`);
      }
    }
    
    return Promise.reject(error);
  }
);

// Retry function for failed requests
const retryRequest = async (requestFn, maxRetries = config.retryAttempts) => {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      if (i < maxRetries) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

// API service methods
export const authAPI = {
  login: (credentials) => retryRequest(() => apiClient.post('/api/auth/login', credentials)),
  register: (userData) => retryRequest(() => apiClient.post('/api/auth/register', userData)),
  logout: () => retryRequest(() => apiClient.post('/api/auth/logout')),
  getProfile: () => retryRequest(() => apiClient.get('/api/auth/profile'))
};

export const retrofitsAPI = {
  getAll: (params = {}) => retryRequest(() => apiClient.get('/api/retrofits', { params })),
  getById: (id) => retryRequest(() => apiClient.get(`/api/retrofits/${id}`)),
  create: (retrofitData) => retryRequest(() => apiClient.post('/api/retrofits', retrofitData)),
  updateStatus: (id, status) => retryRequest(() => apiClient.patch(`/api/retrofits/${id}/status`, { status })),
  addVerification: (id, verificationData) => retryRequest(() => apiClient.post(`/api/retrofits/${id}/verify`, verificationData)),
  getAnalytics: () => retryRequest(() => apiClient.get('/api/retrofits/analytics/summary'))
};

export const healthAPI = {
  check: () => retryRequest(() => apiClient.get('/health')),
  detailed: () => retryRequest(() => apiClient.get('/health/detailed'))
};

// Error handling utility
export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        return data.message || 'Invalid request data';
      case 401:
        return 'Authentication required. Please log in.';
      case 403:
        return 'You do not have permission to perform this action';
      case 404:
        return 'The requested resource was not found';
      case 429:
        return 'Too many requests. Please try again later.';
      case 500:
        return 'Server error. Please try again later.';
      default:
        return data.message || `Request failed with status ${status}`;
    }
  } else if (error.request) {
    // Network error
    return 'Network error. Please check your connection and try again.';
  } else {
    // Something else happened
    return error.message || 'An unexpected error occurred';
  }
};

export default apiClient;
