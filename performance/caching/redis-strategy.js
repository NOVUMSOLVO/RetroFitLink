/**
 * Redis Caching Strategy Implementation
 * Comprehensive caching solution for RetroFitLink application
 * Includes session caching, API response caching, and data layer caching
 */

const redis = require('redis');
const winston = require('winston');
const crypto = require('crypto');

// Configure logger for caching operations
const cacheLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'retrofitlink-cache' },
  transports: [
    new winston.transports.File({ filename: 'logs/cache.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class CacheManager {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || process.env.REDIS_PORT || 6379,
      password: config.password || process.env.REDIS_PASSWORD,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'retrofitlink:',
      defaultTTL: config.defaultTTL || 3600, // 1 hour
      maxRetries: config.maxRetries || 3,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      enableOfflineQueue: false,
      ...config
    };
    
    this.client = null;
    this.isConnected = false;
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      operations: 0
    };
  }

  async connect() {
    try {
      this.client = redis.createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          reconnectStrategy: (retries) => {
            if (retries >= this.config.maxRetries) {
              cacheLogger.error('Redis max retries reached, giving up');
              return new Error('Redis max retries reached');
            }
            return Math.min(retries * 50, 500);
          }
        },
        password: this.config.password,
        database: this.config.db,
        enableOfflineQueue: this.config.enableOfflineQueue
      });

      this.client.on('error', (err) => {
        cacheLogger.error('Redis Client Error:', err);
        this.stats.errors++;
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        cacheLogger.info('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        cacheLogger.info('Redis Client Ready');
      });

      this.client.on('end', () => {
        cacheLogger.info('Redis Client Disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      cacheLogger.info('Redis cache manager initialized');
    } catch (error) {
      cacheLogger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  generateKey(namespace, identifier) {
    return `${this.config.keyPrefix}${namespace}:${identifier}`;
  }

  generateHashKey(data) {
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  async get(namespace, key) {
    try {
      if (!this.isConnected) {
        cacheLogger.warn('Redis not connected, cache miss');
        this.stats.misses++;
        return null;
      }

      const cacheKey = this.generateKey(namespace, key);
      const result = await this.client.get(cacheKey);
      
      this.stats.operations++;
      
      if (result) {
        this.stats.hits++;
        cacheLogger.debug(`Cache hit for key: ${cacheKey}`);
        return JSON.parse(result);
      } else {
        this.stats.misses++;
        cacheLogger.debug(`Cache miss for key: ${cacheKey}`);
        return null;
      }
    } catch (error) {
      cacheLogger.error('Cache get error:', error);
      this.stats.errors++;
      return null;
    }
  }

  async set(namespace, key, value, ttl = null) {
    try {
      if (!this.isConnected) {
        cacheLogger.warn('Redis not connected, skipping cache set');
        return false;
      }

      const cacheKey = this.generateKey(namespace, key);
      const serializedValue = JSON.stringify(value);
      const cacheTTL = ttl || this.config.defaultTTL;

      await this.client.setEx(cacheKey, cacheTTL, serializedValue);
      
      this.stats.operations++;
      cacheLogger.debug(`Cache set for key: ${cacheKey}, TTL: ${cacheTTL}`);
      return true;
    } catch (error) {
      cacheLogger.error('Cache set error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async del(namespace, key) {
    try {
      if (!this.isConnected) {
        return false;
      }

      const cacheKey = this.generateKey(namespace, key);
      const result = await this.client.del(cacheKey);
      
      this.stats.operations++;
      cacheLogger.debug(`Cache delete for key: ${cacheKey}`);
      return result > 0;
    } catch (error) {
      cacheLogger.error('Cache delete error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async mget(namespace, keys) {
    try {
      if (!this.isConnected || !keys.length) {
        return {};
      }

      const cacheKeys = keys.map(key => this.generateKey(namespace, key));
      const results = await this.client.mGet(cacheKeys);
      
      this.stats.operations++;
      
      const parsedResults = {};
      keys.forEach((key, index) => {
        if (results[index]) {
          parsedResults[key] = JSON.parse(results[index]);
          this.stats.hits++;
        } else {
          this.stats.misses++;
        }
      });

      return parsedResults;
    } catch (error) {
      cacheLogger.error('Cache mget error:', error);
      this.stats.errors++;
      return {};
    }
  }

  async mset(namespace, keyValuePairs, ttl = null) {
    try {
      if (!this.isConnected || !Object.keys(keyValuePairs).length) {
        return false;
      }

      const pipeline = this.client.multi();
      const cacheTTL = ttl || this.config.defaultTTL;

      Object.entries(keyValuePairs).forEach(([key, value]) => {
        const cacheKey = this.generateKey(namespace, key);
        const serializedValue = JSON.stringify(value);
        pipeline.setEx(cacheKey, cacheTTL, serializedValue);
      });

      await pipeline.exec();
      this.stats.operations++;
      return true;
    } catch (error) {
      cacheLogger.error('Cache mset error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async invalidatePattern(pattern) {
    try {
      if (!this.isConnected) {
        return false;
      }

      const fullPattern = `${this.config.keyPrefix}${pattern}`;
      const keys = await this.client.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.client.del(keys);
        cacheLogger.info(`Invalidated ${keys.length} keys matching pattern: ${pattern}`);
      }
      
      this.stats.operations++;
      return true;
    } catch (error) {
      cacheLogger.error('Cache pattern invalidation error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async getStats() {
    const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) * 100 || 0;
    
    return {
      ...this.stats,
      hitRate: hitRate.toFixed(2) + '%',
      isConnected: this.isConnected,
      keyCount: this.isConnected ? await this.client.dbSize() : 0
    };
  }

  async flushAll() {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.flushDb();
      cacheLogger.info('Cache flushed');
      return true;
    } catch (error) {
      cacheLogger.error('Cache flush error:', error);
      return false;
    }
  }

  async close() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      cacheLogger.info('Redis connection closed');
    }
  }
}

// Specialized cache strategies for different data types
class SessionCache extends CacheManager {
  constructor(config = {}) {
    super({
      ...config,
      keyPrefix: 'retrofitlink:session:',
      defaultTTL: 86400 // 24 hours for sessions
    });
  }

  async setSession(sessionId, sessionData) {
    return this.set('active', sessionId, sessionData);
  }

  async getSession(sessionId) {
    return this.get('active', sessionId);
  }

  async deleteSession(sessionId) {
    return this.del('active', sessionId);
  }

  async setUserSessions(userId, sessionIds) {
    return this.set('user', userId, sessionIds, 86400);
  }

  async getUserSessions(userId) {
    return this.get('user', userId) || [];
  }

  async invalidateUserSessions(userId) {
    const sessionIds = await this.getUserSessions(userId);
    const promises = sessionIds.map(sessionId => this.deleteSession(sessionId));
    await Promise.all(promises);
    return this.del('user', userId);
  }
}

class APICache extends CacheManager {
  constructor(config = {}) {
    super({
      ...config,
      keyPrefix: 'retrofitlink:api:',
      defaultTTL: 300 // 5 minutes for API responses
    });
  }

  generateAPIKey(method, url, params = {}, userId = null) {
    const keyData = {
      method: method.toUpperCase(),
      url,
      params,
      userId
    };
    return this.generateHashKey(keyData);
  }

  async getAPIResponse(method, url, params = {}, userId = null) {
    const key = this.generateAPIKey(method, url, params, userId);
    return this.get('response', key);
  }

  async setAPIResponse(method, url, params = {}, userId = null, response, ttl = null) {
    const key = this.generateAPIKey(method, url, params, userId);
    return this.set('response', key, response, ttl);
  }

  async invalidateAPI(pattern) {
    return this.invalidatePattern(`response:*${pattern}*`);
  }
}

class DataCache extends CacheManager {
  constructor(config = {}) {
    super({
      ...config,
      keyPrefix: 'retrofitlink:data:',
      defaultTTL: 1800 // 30 minutes for data
    });
  }

  // User data caching
  async setUser(userId, userData) {
    return this.set('user', userId, userData, 3600); // 1 hour
  }

  async getUser(userId) {
    return this.get('user', userId);
  }

  async invalidateUser(userId) {
    await this.del('user', userId);
    await this.invalidatePattern(`*user:${userId}*`);
  }

  // Property data caching
  async setProperty(propertyId, propertyData) {
    return this.set('property', propertyId, propertyData, 1800); // 30 minutes
  }

  async getProperty(propertyId) {
    return this.get('property', propertyId);
  }

  async setProperties(properties) {
    const keyValuePairs = {};
    properties.forEach(property => {
      keyValuePairs[property._id] = property;
    });
    return this.mset('property', keyValuePairs, 1800);
  }

  async getProperties(propertyIds) {
    return this.mget('property', propertyIds);
  }

  async invalidateProperty(propertyId) {
    await this.del('property', propertyId);
    await this.invalidatePattern(`*property:${propertyId}*`);
  }

  // Retrofit data caching
  async setRetrofit(retrofitId, retrofitData) {
    return this.set('retrofit', retrofitId, retrofitData, 900); // 15 minutes
  }

  async getRetrofit(retrofitId) {
    return this.get('retrofit', retrofitId);
  }

  async invalidateRetrofit(retrofitId) {
    await this.del('retrofit', retrofitId);
    await this.invalidatePattern(`*retrofit:${retrofitId}*`);
  }

  // Analytics caching (longer TTL for computed data)
  async setAnalytics(key, data) {
    return this.set('analytics', key, data, 7200); // 2 hours
  }

  async getAnalytics(key) {
    return this.get('analytics', key);
  }

  // IoT data caching (shorter TTL for real-time data)
  async setIoTData(deviceId, data) {
    return this.set('iot', deviceId, data, 60); // 1 minute
  }

  async getIoTData(deviceId) {
    return this.get('iot', deviceId);
  }
}

// Cache middleware for Express.js
const createCacheMiddleware = (cacheManager, options = {}) => {
  const {
    ttl = 300,
    keyGenerator = (req) => `${req.method}:${req.originalUrl}`,
    shouldCache = (req, res) => req.method === 'GET' && res.statusCode === 200,
    excludeHeaders = ['set-cookie', 'cache-control', 'expires']
  } = options;

  return async (req, res, next) => {
    // Skip caching for non-GET requests or if disabled
    if (req.method !== 'GET' || req.headers['cache-control'] === 'no-cache') {
      return next();
    }

    const cacheKey = keyGenerator(req);
    const userId = req.user?.id;

    try {
      // Try to get cached response
      const cached = await cacheManager.getAPIResponse(
        req.method, 
        req.originalUrl, 
        req.query, 
        userId
      );

      if (cached) {
        cacheLogger.debug(`Cache hit for ${req.method} ${req.originalUrl}`);
        
        // Set cached headers
        if (cached.headers) {
          Object.entries(cached.headers).forEach(([key, value]) => {
            if (!excludeHeaders.includes(key.toLowerCase())) {
              res.set(key, value);
            }
          });
        }

        res.set('X-Cache', 'HIT');
        return res.status(cached.statusCode).json(cached.body);
      }

      // Cache miss - intercept response
      const originalSend = res.send;
      const originalJson = res.json;

      res.send = function(body) {
        cacheResponse(body, 'send');
        return originalSend.call(this, body);
      };

      res.json = function(body) {
        cacheResponse(body, 'json');
        return originalJson.call(this, body);
      };

      const cacheResponse = async (body, method) => {
        if (shouldCache(req, res)) {
          const responseData = {
            statusCode: res.statusCode,
            headers: res.getHeaders(),
            body: typeof body === 'string' ? JSON.parse(body) : body,
            timestamp: new Date().toISOString()
          };

          await cacheManager.setAPIResponse(
            req.method,
            req.originalUrl,
            req.query,
            userId,
            responseData,
            ttl
          );

          cacheLogger.debug(`Response cached for ${req.method} ${req.originalUrl}`);
        }

        res.set('X-Cache', 'MISS');
      };

      next();
    } catch (error) {
      cacheLogger.error('Cache middleware error:', error);
      next(); // Continue without caching on error
    }
  };
};

module.exports = {
  CacheManager,
  SessionCache,
  APICache,
  DataCache,
  createCacheMiddleware
};
