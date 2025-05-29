/**
 * Performance Testing Framework
 * Comprehensive load testing and performance monitoring for RetroFitLink
 * Includes K6 test scripts, Artillery configurations, and performance benchmarks
 */

const k6 = require('k6');
const http = require('k6/http');
const { check, group, sleep } = require('k6');
const { Rate, Trend, Counter } = require('k6/metrics');
const winston = require('winston');

// Configure logger for performance testing
const perfLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'retrofitlink-performance' },
  transports: [
    new winston.transports.File({ filename: 'logs/performance.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Custom metrics
const successfulLogins = new Counter('successful_logins');
const failedLogins = new Counter('failed_logins');
const apiResponseTime = new Trend('api_response_time');
const errorRate = new Rate('error_rate');
const propertySearchTime = new Trend('property_search_time');
const retrofitSubmissionTime = new Trend('retrofit_submission_time');

// Test configuration
const testConfig = {
  // Base URL for the application
  baseUrl: process.env.TEST_BASE_URL || 'https://retrofitlink.com',
  apiUrl: process.env.TEST_API_URL || 'https://api.retrofitlink.com',
  
  // Test scenarios
  scenarios: {
    // Smoke test - verify basic functionality
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { test_type: 'smoke' }
    },
    
    // Load test - normal expected load
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 10 },
        { duration: '2m', target: 20 },
        { duration: '5m', target: 20 },
        { duration: '2m', target: 10 },
        { duration: '3m', target: 0 }
      ],
      tags: { test_type: 'load' }
    },
    
    // Stress test - above normal load
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },
        { duration: '5m', target: 20 },
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '10m', target: 0 }
      ],
      tags: { test_type: 'stress' }
    },
    
    // Spike test - sudden load increase
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '30s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 10 },
        { duration: '3m', target: 0 }
      ],
      tags: { test_type: 'spike' }
    },
    
    // Volume test - large amount of data
    volume: {
      executor: 'constant-vus',
      vus: 50,
      duration: '10m',
      tags: { test_type: 'volume' }
    },
    
    // Soak test - extended duration
    soak: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2h',
      tags: { test_type: 'soak' }
    }
  },
  
  // Thresholds for pass/fail criteria
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.1'],
    'api_response_time': ['p(95)<300'],
    'property_search_time': ['p(95)<400'],
    'retrofit_submission_time': ['p(95)<600'],
    'error_rate': ['rate<0.05'],
    'successful_logins': ['count>0'],
    'checks': ['rate>0.95']
  }
};

// Test data
const testUsers = [
  { email: 'resident1@test.com', password: 'TestPass123!', role: 'resident' },
  { email: 'installer1@test.com', password: 'TestPass123!', role: 'installer' },
  { email: 'authority1@test.com', password: 'TestPass123!', role: 'local_authority' }
];

const testProperties = [
  {
    address: '123 Test Street, Test City',
    propertyType: 'detached_house',
    yearBuilt: 1985,
    currentEnergyRating: 'D'
  },
  {
    address: '456 Sample Avenue, Sample Town',
    propertyType: 'semi_detached',
    yearBuilt: 1992,
    currentEnergyRating: 'E'
  }
];

const testRetrofits = [
  {
    retrofitType: 'insulation',
    description: 'Wall insulation installation',
    costEstimate: 5000
  },
  {
    retrofitType: 'heat_pump',
    description: 'Air source heat pump installation',
    costEstimate: 12000
  }
];

// Helper functions
function getRandomUser() {
  return testUsers[Math.floor(Math.random() * testUsers.length)];
}

function getRandomProperty() {
  return testProperties[Math.floor(Math.random() * testProperties.length)];
}

function getRandomRetrofit() {
  return testRetrofits[Math.floor(Math.random() * testRetrofits.length)];
}

function authenticateUser(baseUrl, user) {
  const loginRes = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password
  }), {
    headers: {
      'Content-Type': 'application/json',
    }
  });

  const success = check(loginRes, {
    'login successful': (r) => r.status === 200,
    'received token': (r) => r.json('token') !== undefined
  });

  if (success) {
    successfulLogins.add(1);
    return loginRes.json('token');
  } else {
    failedLogins.add(1);
    return null;
  }
}

// Main test function
function performanceTest() {
  const testType = __ENV.TEST_TYPE || 'load';
  const baseUrl = testConfig.baseUrl;
  const apiUrl = testConfig.apiUrl;

  group('Authentication Flow', () => {
    const user = getRandomUser();
    const token = authenticateUser(apiUrl, user);
    
    if (!token) {
      errorRate.add(1);
      return;
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    group('Property Management', () => {
      // List properties
      const listStart = Date.now();
      const propertiesRes = http.get(`${apiUrl}/api/properties`, { headers });
      propertySearchTime.add(Date.now() - listStart);
      
      check(propertiesRes, {
        'properties listed successfully': (r) => r.status === 200,
        'properties response time < 500ms': (r) => r.timings.duration < 500
      });

      // Search properties
      const searchRes = http.get(`${apiUrl}/api/properties/search?query=house&energyRating=D`, { headers });
      
      check(searchRes, {
        'property search successful': (r) => r.status === 200,
        'search results returned': (r) => r.json('properties').length >= 0
      });

      // Create property (if user is resident)
      if (user.role === 'resident') {
        const property = getRandomProperty();
        const createRes = http.post(`${apiUrl}/api/properties`, JSON.stringify(property), { headers });
        
        check(createRes, {
          'property created successfully': (r) => r.status === 201,
          'property ID returned': (r) => r.json('_id') !== undefined
        });

        if (createRes.status === 201) {
          const propertyId = createRes.json('_id');

          // Submit retrofit application
          const retrofit = getRandomRetrofit();
          const retrofitStart = Date.now();
          const retrofitRes = http.post(`${apiUrl}/api/retrofits`, JSON.stringify({
            propertyId: propertyId,
            ...retrofit
          }), { headers });
          retrofitSubmissionTime.add(Date.now() - retrofitStart);

          check(retrofitRes, {
            'retrofit application submitted': (r) => r.status === 201,
            'retrofit submission time < 1s': (r) => r.timings.duration < 1000
          });
        }
      }
    });

    group('Dashboard and Analytics', () => {
      // Load dashboard
      const dashboardRes = http.get(`${apiUrl}/api/dashboard`, { headers });
      
      check(dashboardRes, {
        'dashboard loaded successfully': (r) => r.status === 200,
        'dashboard response time < 300ms': (r) => r.timings.duration < 300
      });

      // Get analytics data
      if (user.role === 'local_authority') {
        const analyticsRes = http.get(`${apiUrl}/api/analytics/retrofits`, { headers });
        
        check(analyticsRes, {
          'analytics data retrieved': (r) => r.status === 200,
          'analytics contains data': (r) => r.json('data') !== undefined
        });
      }
    });

    group('IoT Data Simulation', () => {
      // Simulate IoT data submission
      const iotData = {
        deviceId: `device_${Math.floor(Math.random() * 1000)}`,
        sensorType: 'temperature',
        value: Math.random() * 30 + 10,
        timestamp: new Date().toISOString()
      };

      const iotRes = http.post(`${apiUrl}/api/iot/data`, JSON.stringify(iotData), { headers });
      
      check(iotRes, {
        'IoT data submitted successfully': (r) => r.status === 201,
        'IoT response time < 200ms': (r) => r.timings.duration < 200
      });
    });

    // Record API response time
    apiResponseTime.add(propertiesRes.timings.duration);
  });

  // Random sleep between 1-3 seconds to simulate user thinking time
  sleep(Math.random() * 2 + 1);
}

// Frontend performance test
function frontendPerformanceTest() {
  group('Frontend Performance', () => {
    const baseUrl = testConfig.baseUrl;

    // Load main page
    const homeRes = http.get(baseUrl);
    check(homeRes, {
      'homepage loads successfully': (r) => r.status === 200,
      'homepage loads in < 2s': (r) => r.timings.duration < 2000,
      'homepage contains title': (r) => r.body.includes('RetroFitLink')
    });

    // Load static assets
    const staticAssets = [
      '/static/js/main.js',
      '/static/css/main.css',
      '/static/images/logo.png'
    ];

    staticAssets.forEach(asset => {
      const assetRes = http.get(`${baseUrl}${asset}`);
      check(assetRes, {
        [`${asset} loads successfully`]: (r) => r.status === 200,
        [`${asset} has cache headers`]: (r) => r.headers['Cache-Control'] !== undefined
      });
    });

    // Test page navigation
    const pagesRes = http.batch([
      ['GET', `${baseUrl}/properties`],
      ['GET', `${baseUrl}/retrofits`],
      ['GET', `${baseUrl}/dashboard`],
      ['GET', `${baseUrl}/about`]
    ]);

    pagesRes.forEach((res, index) => {
      const pages = ['/properties', '/retrofits', '/dashboard', '/about'];
      check(res, {
        [`${pages[index]} page loads`]: (r) => r.status === 200,
        [`${pages[index]} loads quickly`]: (r) => r.timings.duration < 1500
      });
    });
  });
}

// Database performance test
function databasePerformanceTest() {
  group('Database Performance', () => {
    const apiUrl = testConfig.apiUrl;
    const user = getRandomUser();
    const token = authenticateUser(apiUrl, user);
    
    if (!token) return;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Test complex queries
    group('Complex Queries', () => {
      // Geospatial query
      const geoRes = http.get(`${apiUrl}/api/properties/nearby?lat=51.5074&lng=-0.1278&radius=5000`, { headers });
      check(geoRes, {
        'geospatial query executes': (r) => r.status === 200,
        'geospatial query < 400ms': (r) => r.timings.duration < 400
      });

      // Aggregation query
      const aggRes = http.get(`${apiUrl}/api/analytics/energy-ratings`, { headers });
      check(aggRes, {
        'aggregation query executes': (r) => r.status === 200,
        'aggregation query < 600ms': (r) => r.timings.duration < 600
      });

      // Full-text search
      const searchRes = http.get(`${apiUrl}/api/properties/search?q=detached house insulation`, { headers });
      check(searchRes, {
        'full-text search executes': (r) => r.status === 200,
        'search query < 300ms': (r) => r.timings.duration < 300
      });
    });

    // Test high-volume operations
    group('High Volume Operations', () => {
      const batchSize = 10;
      const promises = [];

      // Batch read operations
      for (let i = 0; i < batchSize; i++) {
        const res = http.get(`${apiUrl}/api/properties?page=${i}&limit=20`, { headers });
        promises.push(res);
      }

      check(promises[0], {
        'batch reads complete': (r) => r.status === 200,
        'consistent response times': () => {
          const times = promises.map(p => p.timings.duration);
          const avg = times.reduce((a, b) => a + b) / times.length;
          const variance = times.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / times.length;
          return variance < 10000; // Low variance in response times
        }
      });
    });
  });
}

// Memory and resource test
function resourceTest() {
  group('Resource Usage', () => {
    const apiUrl = testConfig.apiUrl;
    
    // Test memory usage with large payloads
    const largePayload = {
      properties: Array(1000).fill(getRandomProperty()),
      metadata: {
        timestamp: new Date().toISOString(),
        testType: 'resource_test'
      }
    };

    const memoryRes = http.post(`${apiUrl}/api/test/memory`, JSON.stringify(largePayload), {
      headers: { 'Content-Type': 'application/json' }
    });

    check(memoryRes, {
      'large payload handled': (r) => r.status === 200 || r.status === 413,
      'memory usage reasonable': (r) => r.timings.duration < 5000
    });

    // Test concurrent connections
    const concurrentRequests = [];
    for (let i = 0; i < 50; i++) {
      concurrentRequests.push(['GET', `${apiUrl}/api/health`]);
    }

    const batchRes = http.batch(concurrentRequests);
    const successfulRequests = batchRes.filter(r => r.status === 200).length;

    check(batchRes[0], {
      'concurrent requests handled': () => successfulRequests >= 45, // Allow for some failures
      'no connection timeouts': () => batchRes.every(r => r.timings.duration < 5000)
    });
  });
}

// Error handling and resilience test
function resilienceTest() {
  group('Error Handling and Resilience', () => {
    const apiUrl = testConfig.apiUrl;

    // Test invalid endpoints
    const invalidRes = http.get(`${apiUrl}/api/nonexistent`);
    check(invalidRes, {
      'invalid endpoint returns 404': (r) => r.status === 404,
      'error response is structured': (r) => r.json('message') !== undefined
    });

    // Test malformed requests
    const malformedRes = http.post(`${apiUrl}/api/properties`, 'invalid json', {
      headers: { 'Content-Type': 'application/json' }
    });
    check(malformedRes, {
      'malformed request handled': (r) => r.status === 400,
      'error message provided': (r) => r.json('message') !== undefined
    });

    // Test rate limiting
    const rateLimitRequests = [];
    for (let i = 0; i < 200; i++) {
      rateLimitRequests.push(['GET', `${apiUrl}/api/properties`]);
    }

    const rateLimitRes = http.batch(rateLimitRequests);
    const rateLimitedCount = rateLimitRes.filter(r => r.status === 429).length;

    check(rateLimitRes[0], {
      'rate limiting active': () => rateLimitedCount > 0,
      'some requests still succeed': () => rateLimitRes.filter(r => r.status === 200).length > 0
    });
  });
}

// Export test configurations for different tools
const k6Config = {
  scenarios: testConfig.scenarios,
  thresholds: testConfig.thresholds,
  
  export default function() {
    const testType = __ENV.TEST_TYPE || 'load';
    
    switch(testType) {
      case 'frontend':
        frontendPerformanceTest();
        break;
      case 'database':
        databasePerformanceTest();
        break;
      case 'resource':
        resourceTest();
        break;
      case 'resilience':
        resilienceTest();
        break;
      default:
        performanceTest();
    }
  }
};

// Artillery.js configuration
const artilleryConfig = {
  config: {
    target: testConfig.apiUrl,
    phases: [
      { duration: 60, arrivalRate: 5, name: 'Warm up' },
      { duration: 120, arrivalRate: 10, name: 'Ramp up load' },
      { duration: 300, arrivalRate: 20, name: 'Sustained load' },
      { duration: 60, arrivalRate: 5, name: 'Cool down' }
    ],
    payload: {
      path: './test-data.csv',
      fields: ['email', 'password', 'role']
    },
    variables: {
      baseUrl: testConfig.baseUrl,
      apiUrl: testConfig.apiUrl
    }
  },
  scenarios: [
    {
      name: 'Authentication and Property Management',
      weight: 60,
      flow: [
        {
          post: {
            url: '/api/auth/login',
            json: {
              email: '{{ email }}',
              password: '{{ password }}'
            },
            capture: {
              json: '$.token',
              as: 'token'
            }
          }
        },
        {
          get: {
            url: '/api/properties',
            headers: {
              Authorization: 'Bearer {{ token }}'
            }
          }
        },
        {
          get: {
            url: '/api/dashboard',
            headers: {
              Authorization: 'Bearer {{ token }}'
            }
          }
        }
      ]
    },
    {
      name: 'Property Search and Analytics',
      weight: 30,
      flow: [
        {
          get: {
            url: '/api/properties/search?query=house&energyRating=D'
          }
        },
        {
          get: {
            url: '/api/analytics/energy-ratings'
          }
        }
      ]
    },
    {
      name: 'IoT Data Simulation',
      weight: 10,
      flow: [
        {
          post: {
            url: '/api/iot/data',
            json: {
              deviceId: 'device_{{ $randomInt(1, 1000) }}',
              sensorType: 'temperature',
              value: '{{ $randomInt(10, 40) }}',
              timestamp: '{{ $timestamp }}'
            }
          }
        }
      ]
    }
  ]
};

// JMeter test plan configuration
const jmeterConfig = {
  testPlan: {
    name: 'RetroFitLink Performance Test',
    threadGroups: [
      {
        name: 'Normal Load',
        threads: 20,
        rampUp: 60,
        duration: 300,
        loops: -1
      },
      {
        name: 'Peak Load',
        threads: 100,
        rampUp: 120,
        duration: 600,
        loops: -1
      }
    ],
    httpSamplers: [
      {
        name: 'Login',
        method: 'POST',
        path: '/api/auth/login',
        body: '{"email":"${email}","password":"${password}"}',
        headers: {
          'Content-Type': 'application/json'
        }
      },
      {
        name: 'List Properties',
        method: 'GET',
        path: '/api/properties',
        headers: {
          'Authorization': 'Bearer ${token}'
        }
      },
      {
        name: 'Search Properties',
        method: 'GET',
        path: '/api/properties/search?query=${searchQuery}',
        headers: {
          'Authorization': 'Bearer ${token}'
        }
      }
    ]
  }
};

module.exports = {
  k6Config,
  artilleryConfig,
  jmeterConfig,
  testConfig,
  performanceTest,
  frontendPerformanceTest,
  databasePerformanceTest,
  resourceTest,
  resilienceTest
};
