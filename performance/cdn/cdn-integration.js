/**
 * CDN Integration Configuration
 * Comprehensive CDN setup for RetroFitLink application
 * Supports CloudFront, CloudFlare, and other CDN providers
 */

const AWS = require('aws-sdk');
const crypto = require('crypto');
const winston = require('winston');

// Configure logger for CDN operations
const cdnLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'retrofitlink-cdn' },
  transports: [
    new winston.transports.File({ filename: 'logs/cdn.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class CDNManager {
  constructor(config = {}) {
    this.config = {
      provider: config.provider || process.env.CDN_PROVIDER || 'cloudfront',
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      distributionId: config.distributionId || process.env.CDN_DISTRIBUTION_ID,
      domain: config.domain || process.env.CDN_DOMAIN,
      s3Bucket: config.s3Bucket || process.env.S3_BUCKET,
      accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      ...config
    };

    this.cloudfront = null;
    this.s3 = null;
    this.initializeServices();
  }

  initializeServices() {
    if (this.config.provider === 'cloudfront') {
      AWS.config.update({
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        region: this.config.region
      });

      this.cloudfront = new AWS.CloudFront();
      this.s3 = new AWS.S3();
    }
  }

  // CloudFront Distribution Configuration
  getCloudFrontDistributionConfig() {
    return {
      CallerReference: `retrofitlink-${Date.now()}`,
      Aliases: {
        Quantity: 1,
        Items: [this.config.domain]
      },
      DefaultRootObject: 'index.html',
      Comment: 'RetroFitLink CDN Distribution',
      Enabled: true,
      Origins: {
        Quantity: 3,
        Items: [
          {
            Id: 'retrofitlink-frontend',
            DomainName: `${this.config.s3Bucket}.s3.amazonaws.com`,
            S3OriginConfig: {
              OriginAccessIdentity: ''
            }
          },
          {
            Id: 'retrofitlink-api',
            DomainName: process.env.API_DOMAIN || 'api.retrofitlink.com',
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: 'https-only',
              OriginSslProtocols: {
                Quantity: 1,
                Items: ['TLSv1.2']
              }
            }
          },
          {
            Id: 'retrofitlink-assets',
            DomainName: `assets.${this.config.domain}`,
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: 'https-only'
            }
          }
        ]
      },
      DefaultCacheBehavior: {
        TargetOriginId: 'retrofitlink-frontend',
        ViewerProtocolPolicy: 'redirect-to-https',
        MinTTL: 0,
        DefaultTTL: 86400, // 24 hours
        MaxTTL: 31536000, // 1 year
        ForwardedValues: {
          QueryString: false,
          Cookies: {
            Forward: 'none'
          },
          Headers: {
            Quantity: 0
          }
        },
        TrustedSigners: {
          Enabled: false,
          Quantity: 0
        },
        Compress: true,
        SmoothStreaming: false
      },
      CacheBehaviors: {
        Quantity: 4,
        Items: [
          {
            PathPattern: '/api/*',
            TargetOriginId: 'retrofitlink-api',
            ViewerProtocolPolicy: 'https-only',
            MinTTL: 0,
            DefaultTTL: 0,
            MaxTTL: 0,
            ForwardedValues: {
              QueryString: true,
              Cookies: {
                Forward: 'all'
              },
              Headers: {
                Quantity: 3,
                Items: ['Authorization', 'Content-Type', 'X-Requested-With']
              }
            },
            Compress: true,
            AllowedMethods: {
              Quantity: 7,
              Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
              CachedMethods: {
                Quantity: 2,
                Items: ['GET', 'HEAD']
              }
            }
          },
          {
            PathPattern: '/static/*',
            TargetOriginId: 'retrofitlink-assets',
            ViewerProtocolPolicy: 'redirect-to-https',
            MinTTL: 86400, // 24 hours
            DefaultTTL: 604800, // 7 days
            MaxTTL: 31536000, // 1 year
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: 'none'
              }
            },
            Compress: true
          },
          {
            PathPattern: '/images/*',
            TargetOriginId: 'retrofitlink-assets',
            ViewerProtocolPolicy: 'redirect-to-https',
            MinTTL: 604800, // 7 days
            DefaultTTL: 2592000, // 30 days
            MaxTTL: 31536000, // 1 year
            ForwardedValues: {
              QueryString: true, // For image transformations
              Cookies: {
                Forward: 'none'
              }
            },
            Compress: true
          },
          {
            PathPattern: '*.js',
            TargetOriginId: 'retrofitlink-frontend',
            ViewerProtocolPolicy: 'redirect-to-https',
            MinTTL: 604800, // 7 days
            DefaultTTL: 2592000, // 30 days
            MaxTTL: 31536000, // 1 year
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: 'none'
              }
            },
            Compress: true
          }
        ]
      },
      CustomErrorResponses: {
        Quantity: 2,
        Items: [
          {
            ErrorCode: 404,
            ResponsePagePath: '/index.html',
            ResponseCode: '200',
            ErrorCachingMinTTL: 300
          },
          {
            ErrorCode: 403,
            ResponsePagePath: '/index.html',
            ResponseCode: '200',
            ErrorCachingMinTTL: 300
          }
        ]
      },
      Logging: {
        Enabled: true,
        IncludeCookies: false,
        Bucket: `${this.config.s3Bucket}-logs.s3.amazonaws.com`,
        Prefix: 'cdn-logs/'
      },
      PriceClass: 'PriceClass_100', // Use only US and Europe edge locations
      WebACLId: process.env.WAF_ACL_ID || '' // Web Application Firewall
    };
  }

  // Create CloudFront distribution
  async createDistribution() {
    try {
      if (this.config.provider !== 'cloudfront') {
        throw new Error('CloudFront not configured');
      }

      const distributionConfig = this.getCloudFrontDistributionConfig();
      
      const params = {
        DistributionConfig: distributionConfig
      };

      const result = await this.cloudfront.createDistribution(params).promise();
      
      cdnLogger.info('CloudFront distribution created:', {
        id: result.Distribution.Id,
        domainName: result.Distribution.DomainName,
        status: result.Distribution.Status
      });

      return result;
    } catch (error) {
      cdnLogger.error('Failed to create CloudFront distribution:', error);
      throw error;
    }
  }

  // Update existing distribution
  async updateDistribution(distributionId, config) {
    try {
      // Get current distribution config
      const currentConfig = await this.cloudfront.getDistribution({
        Id: distributionId
      }).promise();

      const updateParams = {
        Id: distributionId,
        DistributionConfig: {
          ...currentConfig.Distribution.DistributionConfig,
          ...config
        },
        IfMatch: currentConfig.ETag
      };

      const result = await this.cloudfront.updateDistribution(updateParams).promise();
      
      cdnLogger.info(`CloudFront distribution ${distributionId} updated`);
      return result;
    } catch (error) {
      cdnLogger.error('Failed to update CloudFront distribution:', error);
      throw error;
    }
  }

  // Invalidate cache
  async invalidateCache(paths = ['/*']) {
    try {
      if (!this.config.distributionId) {
        throw new Error('Distribution ID not configured');
      }

      const params = {
        DistributionId: this.config.distributionId,
        InvalidationBatch: {
          CallerReference: `invalidation-${Date.now()}`,
          Paths: {
            Quantity: paths.length,
            Items: paths
          }
        }
      };

      const result = await this.cloudfront.createInvalidation(params).promise();
      
      cdnLogger.info('Cache invalidation created:', {
        id: result.Invalidation.Id,
        status: result.Invalidation.Status,
        paths: paths
      });

      return result;
    } catch (error) {
      cdnLogger.error('Failed to invalidate cache:', error);
      throw error;
    }
  }

  // Upload assets to S3
  async uploadAsset(key, body, options = {}) {
    try {
      const defaultOptions = {
        Bucket: this.config.s3Bucket,
        Key: key,
        Body: body,
        ContentType: this.getContentType(key),
        CacheControl: this.getCacheControl(key),
        Metadata: {
          'uploaded-by': 'retrofitlink-cdn-manager',
          'upload-time': new Date().toISOString()
        }
      };

      const params = { ...defaultOptions, ...options };
      const result = await this.s3.upload(params).promise();
      
      cdnLogger.info(`Asset uploaded: ${key}`);
      return result;
    } catch (error) {
      cdnLogger.error(`Failed to upload asset ${key}:`, error);
      throw error;
    }
  }

  // Batch upload assets
  async uploadAssets(assets) {
    try {
      const uploads = assets.map(asset => 
        this.uploadAsset(asset.key, asset.body, asset.options)
      );

      const results = await Promise.allSettled(uploads);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      cdnLogger.info(`Batch upload completed: ${successful} successful, ${failed} failed`);
      
      return results;
    } catch (error) {
      cdnLogger.error('Batch upload failed:', error);
      throw error;
    }
  }

  // Get content type based on file extension
  getContentType(key) {
    const extension = key.split('.').pop().toLowerCase();
    
    const contentTypes = {
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      'ttf': 'font/ttf',
      'woff': 'font/woff',
      'woff2': 'font/woff2'
    };

    return contentTypes[extension] || 'application/octet-stream';
  }

  // Get cache control headers based on file type
  getCacheControl(key) {
    const extension = key.split('.').pop().toLowerCase();
    
    // Static assets with versioning can be cached for a long time
    if (['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'ttf', 'woff', 'woff2'].includes(extension)) {
      return 'public, max-age=31536000, immutable'; // 1 year
    }
    
    // HTML files should be revalidated
    if (extension === 'html') {
      return 'public, max-age=0, must-revalidate';
    }
    
    // Default cache control
    return 'public, max-age=86400'; // 24 hours
  }

  // Generate signed URLs for private content
  generateSignedUrl(key, expiresIn = 3600) {
    const params = {
      Bucket: this.config.s3Bucket,
      Key: key,
      Expires: expiresIn
    };

    return this.s3.getSignedUrl('getObject', params);
  }

  // Monitor CDN performance
  async getDistributionMetrics(startTime, endTime) {
    try {
      const cloudwatch = new AWS.CloudWatch({ region: 'us-east-1' }); // CloudFront metrics are in us-east-1

      const metrics = [
        'Requests',
        'BytesDownloaded',
        'BytesUploaded',
        '4xxErrorRate',
        '5xxErrorRate',
        'OriginLatency'
      ];

      const promises = metrics.map(metricName => 
        cloudwatch.getMetricStatistics({
          Namespace: 'AWS/CloudFront',
          MetricName: metricName,
          Dimensions: [
            {
              Name: 'DistributionId',
              Value: this.config.distributionId
            }
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600, // 1 hour
          Statistics: ['Sum', 'Average', 'Maximum']
        }).promise()
      );

      const results = await Promise.all(promises);
      
      const metricsData = {};
      results.forEach((result, index) => {
        metricsData[metrics[index]] = result.Datapoints;
      });

      return metricsData;
    } catch (error) {
      cdnLogger.error('Failed to get distribution metrics:', error);
      throw error;
    }
  }

  // Optimize images before upload
  async optimizeAndUploadImage(key, imageBuffer, options = {}) {
    try {
      const sharp = require('sharp'); // Optional dependency
      
      // Create optimized versions
      const optimized = await sharp(imageBuffer)
        .resize(options.width, options.height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      // Create WebP version
      const webp = await sharp(imageBuffer)
        .resize(options.width, options.height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 85 })
        .toBuffer();

      // Upload both versions
      const originalKey = key;
      const webpKey = key.replace(/\.(jpg|jpeg|png)$/i, '.webp');

      const uploads = await Promise.all([
        this.uploadAsset(originalKey, optimized, {
          ...options,
          ContentType: 'image/jpeg'
        }),
        this.uploadAsset(webpKey, webp, {
          ...options,
          ContentType: 'image/webp'
        })
      ]);

      cdnLogger.info(`Optimized images uploaded: ${originalKey}, ${webpKey}`);
      return uploads;
    } catch (error) {
      cdnLogger.error('Failed to optimize and upload image:', error);
      // Fallback to original upload
      return this.uploadAsset(key, imageBuffer, options);
    }
  }
}

// CDN middleware for Express.js
const createCDNMiddleware = (cdnManager) => {
  return (req, res, next) => {
    // Add CDN helper methods to response object
    res.cdnUrl = (path) => {
      if (cdnManager.config.domain) {
        return `https://${cdnManager.config.domain}${path}`;
      }
      return path;
    };

    res.assetUrl = (asset) => {
      return res.cdnUrl(`/static/${asset}`);
    };

    res.imageUrl = (image, options = {}) => {
      let url = res.cdnUrl(`/images/${image}`);
      
      // Add query parameters for image transformations
      if (options.width || options.height || options.quality) {
        const params = new URLSearchParams();
        if (options.width) params.append('w', options.width);
        if (options.height) params.append('h', options.height);
        if (options.quality) params.append('q', options.quality);
        url += `?${params.toString()}`;
      }
      
      return url;
    };

    // Set CDN-related headers
    res.set('X-CDN-Provider', cdnManager.config.provider);
    if (cdnManager.config.domain) {
      res.set('X-CDN-Domain', cdnManager.config.domain);
    }

    next();
  };
};

// CloudFlare configuration (alternative CDN provider)
const getCloudFlareConfig = () => {
  return {
    zone_id: process.env.CLOUDFLARE_ZONE_ID,
    api_token: process.env.CLOUDFLARE_API_TOKEN,
    cache_rules: [
      {
        pattern: '/static/*',
        cache_level: 'cache_everything',
        edge_cache_ttl: 2592000, // 30 days
        browser_cache_ttl: 604800 // 7 days
      },
      {
        pattern: '/api/*',
        cache_level: 'bypass'
      },
      {
        pattern: '*.js',
        cache_level: 'cache_everything',
        edge_cache_ttl: 31536000, // 1 year
        browser_cache_ttl: 31536000
      },
      {
        pattern: '*.css',
        cache_level: 'cache_everything',
        edge_cache_ttl: 31536000,
        browser_cache_ttl: 31536000
      },
      {
        pattern: '/images/*',
        cache_level: 'cache_everything',
        edge_cache_ttl: 2592000,
        browser_cache_ttl: 604800
      }
    ],
    page_rules: [
      {
        pattern: 'www.retrofitlink.com/*',
        forwarding_url: 'https://retrofitlink.com/$1',
        status_code: 301
      }
    ],
    security_settings: {
      security_level: 'medium',
      challenge_ttl: 1800,
      browser_integrity_check: true,
      hotlink_protection: true
    }
  };
};

module.exports = {
  CDNManager,
  createCDNMiddleware,
  getCloudFlareConfig
};
