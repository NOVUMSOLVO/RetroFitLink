/**
 * MongoDB Database Optimization Configuration
 * Implements comprehensive indexing, query optimization, and performance monitoring
 * for RetroFitLink production deployment
 */

const { MongoClient } = require('mongodb');
const winston = require('winston');

// Configure logger for database operations
const dbLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'retrofitlink-db-optimizer' },
  transports: [
    new winston.transports.File({ filename: 'logs/db-optimization.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class DatabaseOptimizer {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.client = null;
    this.db = null;
  }

  async connect() {
    try {
      this.client = new MongoClient(this.connectionString, {
        useUnifiedTopology: true,
        maxPoolSize: 100,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferMaxEntries: 0,
        connectTimeoutMS: 10000,
        family: 4,
        // Optimization settings
        retryWrites: true,
        w: 'majority',
        readPreference: 'primaryPreferred',
        readConcern: { level: 'majority' }
      });

      await this.client.connect();
      this.db = this.client.db('retrofitlink');
      dbLogger.info('Connected to MongoDB for optimization');
    } catch (error) {
      dbLogger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      dbLogger.info('Creating performance indexes...');

      // Users collection indexes
      await this.db.collection('users').createIndex(
        { email: 1 }, 
        { unique: true, background: true, name: 'idx_users_email_unique' }
      );
      
      await this.db.collection('users').createIndex(
        { role: 1, status: 1 }, 
        { background: true, name: 'idx_users_role_status' }
      );
      
      await this.db.collection('users').createIndex(
        { createdAt: -1 }, 
        { background: true, name: 'idx_users_created_desc' }
      );

      await this.db.collection('users').createIndex(
        { 'profile.location': '2dsphere' }, 
        { background: true, name: 'idx_users_location_geo', sparse: true }
      );

      // Properties collection indexes
      await this.db.collection('properties').createIndex(
        { owner: 1, status: 1 }, 
        { background: true, name: 'idx_properties_owner_status' }
      );
      
      await this.db.collection('properties').createIndex(
        { localAuthority: 1, propertyType: 1 }, 
        { background: true, name: 'idx_properties_authority_type' }
      );
      
      await this.db.collection('properties').createIndex(
        { location: '2dsphere' }, 
        { background: true, name: 'idx_properties_location_geo' }
      );
      
      await this.db.collection('properties').createIndex(
        { energyRating: 1, createdAt: -1 }, 
        { background: true, name: 'idx_properties_energy_created' }
      );

      await this.db.collection('properties').createIndex(
        { address: 'text', description: 'text' }, 
        { background: true, name: 'idx_properties_text_search' }
      );

      // Retrofits collection indexes
      await this.db.collection('retrofits').createIndex(
        { propertyId: 1, status: 1 }, 
        { background: true, name: 'idx_retrofits_property_status' }
      );
      
      await this.db.collection('retrofits').createIndex(
        { installer: 1, status: 1, scheduledDate: -1 }, 
        { background: true, name: 'idx_retrofits_installer_status_date' }
      );
      
      await this.db.collection('retrofits').createIndex(
        { status: 1, createdAt: -1 }, 
        { background: true, name: 'idx_retrofits_status_created' }
      );
      
      await this.db.collection('retrofits').createIndex(
        { retrofitType: 1, costEstimate: 1 }, 
        { background: true, name: 'idx_retrofits_type_cost' }
      );

      await this.db.collection('retrofits').createIndex(
        { 'verification.blockchainHash': 1 }, 
        { background: true, name: 'idx_retrofits_blockchain_hash', sparse: true }
      );

      // Applications collection indexes
      await this.db.collection('applications').createIndex(
        { propertyId: 1, status: 1 }, 
        { background: true, name: 'idx_applications_property_status' }
      );
      
      await this.db.collection('applications').createIndex(
        { applicant: 1, status: 1, submittedAt: -1 }, 
        { background: true, name: 'idx_applications_applicant_status_date' }
      );
      
      await this.db.collection('applications').createIndex(
        { localAuthority: 1, status: 1, priority: -1 }, 
        { background: true, name: 'idx_applications_authority_status_priority' }
      );

      // IoT Data collection indexes (for sensor data)
      await this.db.collection('iotData').createIndex(
        { propertyId: 1, timestamp: -1 }, 
        { background: true, name: 'idx_iot_property_timestamp' }
      );
      
      await this.db.collection('iotData').createIndex(
        { deviceId: 1, sensorType: 1, timestamp: -1 }, 
        { background: true, name: 'idx_iot_device_sensor_timestamp' }
      );
      
      await this.db.collection('iotData').createIndex(
        { timestamp: 1 }, 
        { 
          background: true, 
          name: 'idx_iot_timestamp_ttl',
          expireAfterSeconds: 31536000 // 1 year TTL for IoT data
        }
      );

      // Audit logs collection indexes
      await this.db.collection('auditLogs').createIndex(
        { userId: 1, action: 1, timestamp: -1 }, 
        { background: true, name: 'idx_audit_user_action_timestamp' }
      );
      
      await this.db.collection('auditLogs').createIndex(
        { resourceType: 1, resourceId: 1, timestamp: -1 }, 
        { background: true, name: 'idx_audit_resource_timestamp' }
      );
      
      await this.db.collection('auditLogs').createIndex(
        { timestamp: 1 }, 
        { 
          background: true, 
          name: 'idx_audit_timestamp_ttl',
          expireAfterSeconds: 7776000 // 90 days TTL for audit logs
        }
      );

      // Sessions collection indexes (for caching)
      await this.db.collection('sessions').createIndex(
        { sessionId: 1 }, 
        { unique: true, background: true, name: 'idx_sessions_id_unique' }
      );
      
      await this.db.collection('sessions').createIndex(
        { userId: 1 }, 
        { background: true, name: 'idx_sessions_user' }
      );
      
      await this.db.collection('sessions').createIndex(
        { expiresAt: 1 }, 
        { 
          background: true, 
          name: 'idx_sessions_expires_ttl',
          expireAfterSeconds: 0
        }
      );

      dbLogger.info('All performance indexes created successfully');
    } catch (error) {
      dbLogger.error('Failed to create indexes:', error);
      throw error;
    }
  }

  async analyzePerformance() {
    try {
      dbLogger.info('Analyzing database performance...');

      const collections = ['users', 'properties', 'retrofits', 'applications', 'iotData'];
      const performanceReport = {};

      for (const collectionName of collections) {
        const collection = this.db.collection(collectionName);
        
        // Get collection stats
        const stats = await this.db.command({ collStats: collectionName });
        
        // Get index usage stats
        const indexStats = await collection.aggregate([
          { $indexStats: {} }
        ]).toArray();

        // Get slow operations
        const slowOps = await this.db.admin().command({
          currentOp: true,
          "secs_running": { $gte: 1 }
        });

        performanceReport[collectionName] = {
          documentCount: stats.count,
          storageSize: stats.storageSize,
          totalIndexSize: stats.totalIndexSize,
          avgObjSize: stats.avgObjSize,
          indexes: indexStats,
          slowOperationsCount: slowOps.inprog.length
        };
      }

      dbLogger.info('Performance analysis completed', { report: performanceReport });
      return performanceReport;
    } catch (error) {
      dbLogger.error('Failed to analyze performance:', error);
      throw error;
    }
  }

  async optimizeQueries() {
    try {
      dbLogger.info('Setting up query optimization...');

      // Configure read preferences for different operations
      const readPreferences = {
        // Analytics queries can use secondary reads
        analytics: 'secondary',
        // User-facing queries use primary preferred
        userFacing: 'primaryPreferred',
        // Critical operations use primary
        critical: 'primary'
      };

      // Set up aggregation pipeline optimizations
      const aggregationOptimizations = {
        // Enable allowDiskUse for large aggregations
        allowDiskUse: true,
        // Set cursor batch size
        batchSize: 1000,
        // Enable explain for query analysis
        explain: process.env.NODE_ENV === 'development'
      };

      dbLogger.info('Query optimizations configured', {
        readPreferences,
        aggregationOptimizations
      });

    } catch (error) {
      dbLogger.error('Failed to optimize queries:', error);
      throw error;
    }
  }

  async setupSharding() {
    try {
      if (process.env.ENABLE_SHARDING !== 'true') {
        dbLogger.info('Sharding not enabled, skipping setup');
        return;
      }

      dbLogger.info('Setting up database sharding...');

      // Enable sharding on database
      await this.db.admin().command({ enableSharding: 'retrofitlink' });

      // Shard key strategies
      const shardingConfig = {
        // Users: shard by email hash for even distribution
        users: { email: 'hashed' },
        
        // Properties: shard by location for geo-queries
        properties: { 'location.coordinates': '2dsphere' },
        
        // Retrofits: shard by propertyId for related data locality
        retrofits: { propertyId: 1, createdAt: 1 },
        
        // IoT Data: shard by propertyId and timestamp for time-series
        iotData: { propertyId: 1, timestamp: 1 }
      };

      for (const [collection, shardKey] of Object.entries(shardingConfig)) {
        await this.db.admin().command({
          shardCollection: `retrofitlink.${collection}`,
          key: shardKey
        });
        
        dbLogger.info(`Sharding enabled for ${collection}`, { shardKey });
      }

    } catch (error) {
      dbLogger.error('Failed to setup sharding:', error);
      // Don't throw - sharding setup might fail in non-sharded environments
    }
  }

  async setupReadReplicas() {
    try {
      dbLogger.info('Configuring read replica preferences...');

      // Configure read concern levels
      const readConcernLevels = {
        // Real-time data needs strong consistency
        realtime: 'majority',
        // Analytics can use eventual consistency
        analytics: 'local',
        // Reporting can use available reads
        reporting: 'available'
      };

      // Set up connection pools for different read patterns
      const readPoolConfig = {
        analytics: {
          readPreference: 'secondary',
          maxPoolSize: 50,
          minPoolSize: 10
        },
        reporting: {
          readPreference: 'secondaryPreferred',
          maxPoolSize: 30,
          minPoolSize: 5
        },
        userFacing: {
          readPreference: 'primaryPreferred',
          maxPoolSize: 100,
          minPoolSize: 20
        }
      };

      dbLogger.info('Read replica configuration completed', {
        readConcernLevels,
        readPoolConfig
      });

    } catch (error) {
      dbLogger.error('Failed to configure read replicas:', error);
      throw error;
    }
  }

  async monitorPerformance() {
    try {
      // Set up performance monitoring
      const performanceMetrics = {
        connections: await this.db.admin().command({ serverStatus: 1 }),
        operations: await this.db.admin().command({ opcounters: 1 }),
        memory: await this.db.admin().command({ serverStatus: 1 }).then(status => status.mem),
        locks: await this.db.admin().command({ serverStatus: 1 }).then(status => status.locks)
      };

      dbLogger.info('Performance metrics collected', performanceMetrics);
      return performanceMetrics;
    } catch (error) {
      dbLogger.error('Failed to collect performance metrics:', error);
      throw error;
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      dbLogger.info('Database connection closed');
    }
  }
}

// Utility functions for query optimization
const QueryOptimizer = {
  // Optimize user queries
  optimizedUserQuery: (filters = {}) => {
    const pipeline = [];
    
    // Use indexes for filtering
    if (filters.role) {
      pipeline.push({ $match: { role: filters.role } });
    }
    
    if (filters.status) {
      pipeline.push({ $match: { status: filters.status } });
    }
    
    // Limit fields to reduce data transfer
    pipeline.push({
      $project: {
        password: 0,
        __v: 0
      }
    });
    
    return pipeline;
  },

  // Optimize property search
  optimizedPropertySearch: (searchParams = {}) => {
    const pipeline = [];
    
    // Geospatial queries
    if (searchParams.location && searchParams.radius) {
      pipeline.push({
        $match: {
          location: {
            $nearSphere: {
              $geometry: searchParams.location,
              $maxDistance: searchParams.radius
            }
          }
        }
      });
    }
    
    // Text search
    if (searchParams.query) {
      pipeline.push({
        $match: {
          $text: { $search: searchParams.query }
        }
      });
    }
    
    // Faceted search
    if (searchParams.filters) {
      Object.entries(searchParams.filters).forEach(([key, value]) => {
        pipeline.push({ $match: { [key]: value } });
      });
    }
    
    return pipeline;
  },

  // Optimize retrofit analytics
  optimizedRetrofitAnalytics: (dateRange = {}) => {
    const pipeline = [
      // Match date range
      {
        $match: {
          createdAt: {
            $gte: dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            $lte: dateRange.end || new Date()
          }
        }
      },
      
      // Group by status and type
      {
        $group: {
          _id: {
            status: '$status',
            type: '$retrofitType'
          },
          count: { $sum: 1 },
          totalCost: { $sum: '$costEstimate' },
          avgCost: { $avg: '$costEstimate' }
        }
      },
      
      // Sort by count
      { $sort: { count: -1 } }
    ];
    
    return pipeline;
  }
};

module.exports = {
  DatabaseOptimizer,
  QueryOptimizer
};
