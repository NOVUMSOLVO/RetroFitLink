/**
 * Load Balancer Optimization Configuration
 * Advanced load balancing strategies for RetroFitLink production deployment
 * Includes NGINX, HAProxy, and cloud provider configurations
 */

// NGINX Load Balancer Configuration
const nginxConfig = `
# Main NGINX configuration for RetroFitLink
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Basic settings
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens off;
    
    # Buffer settings
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    client_max_body_size 50m;
    large_client_header_buffers 4 8k;
    
    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;
    
    # Brotli compression (if module available)
    brotli on;
    brotli_comp_level 6;
    brotli_types
        text/plain
        text/css
        application/json
        application/javascript
        text/xml
        application/xml
        application/xml+rss
        text/javascript;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=2r/s;
    limit_req_zone $binary_remote_addr zone=general:10m rate=50r/s;
    
    # Connection limiting
    limit_conn_zone $binary_remote_addr zone=addr:10m;
    
    # Real IP configuration (for cloud deployments)
    set_real_ip_from 10.0.0.0/8;
    set_real_ip_from 172.16.0.0/12;
    set_real_ip_from 192.168.0.0/16;
    set_real_ip_from 169.254.0.0/16;
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;
    
    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';
    
    access_log /var/log/nginx/access.log main;
    
    # Upstream backend servers with health checks
    upstream retrofitlink_backend {
        least_conn;
        keepalive 32;
        keepalive_requests 1000;
        keepalive_timeout 60s;
        
        server retrofitlink-backend-1:5000 weight=3 max_fails=3 fail_timeout=30s;
        server retrofitlink-backend-2:5000 weight=3 max_fails=3 fail_timeout=30s;
        server retrofitlink-backend-3:5000 weight=3 max_fails=3 fail_timeout=30s;
        server retrofitlink-backend-4:5000 weight=2 max_fails=3 fail_timeout=30s backup;
        server retrofitlink-backend-5:5000 weight=2 max_fails=3 fail_timeout=30s backup;
    }
    
    # Upstream for IoT data processing (different algorithm)
    upstream retrofitlink_iot {
        ip_hash;  # Sticky sessions for IoT devices
        
        server retrofitlink-iot-1:6000 weight=2 max_fails=2 fail_timeout=20s;
        server retrofitlink-iot-2:6000 weight=2 max_fails=2 fail_timeout=20s;
        server retrofitlink-iot-3:6000 weight=1 max_fails=2 fail_timeout=20s;
    }
    
    # Upstream for blockchain services
    upstream retrofitlink_blockchain {
        hash $request_uri consistent;  # Consistent hashing for blockchain calls
        
        server retrofitlink-blockchain-1:7000 weight=2 max_fails=1 fail_timeout=60s;
        server retrofitlink-blockchain-2:7000 weight=2 max_fails=1 fail_timeout=60s;
    }
    
    # Cache configuration
    proxy_cache_path /var/cache/nginx/api levels=1:2 keys_zone=api_cache:10m max_size=1g 
                     inactive=60m use_temp_path=off;
    proxy_cache_path /var/cache/nginx/static levels=1:2 keys_zone=static_cache:10m max_size=5g 
                     inactive=7d use_temp_path=off;
    
    # Map for cache control
    map $request_uri $cache_control {
        ~*\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ "public, max-age=31536000, immutable";
        ~*/api/ "no-cache, no-store, must-revalidate";
        default "public, max-age=3600";
    }
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Main server block
    server {
        listen 80;
        listen [::]:80;
        server_name retrofitlink.com www.retrofitlink.com;
        
        # Redirect HTTP to HTTPS
        return 301 https://$server_name$request_uri;
    }
    
    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name retrofitlink.com www.retrofitlink.com;
        
        # SSL certificates
        ssl_certificate /etc/ssl/certs/retrofitlink.crt;
        ssl_certificate_key /etc/ssl/private/retrofitlink.key;
        ssl_trusted_certificate /etc/ssl/certs/retrofitlink-chain.crt;
        
        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.googleapis.com *.gstatic.com; style-src 'self' 'unsafe-inline' *.googleapis.com; img-src 'self' data: *.googleapis.com *.gstatic.com; font-src 'self' *.googleapis.com *.gstatic.com; connect-src 'self' *.retrofitlink.com wss:; frame-ancestors 'none';" always;
        
        # Rate limiting
        limit_req zone=general burst=100 nodelay;
        limit_conn addr 50;
        
        # Root and index
        root /var/www/retrofitlink;
        index index.html index.htm;
        
        # Main application (SPA)
        location / {
            try_files $uri $uri/ /index.html;
            expires 1h;
            add_header Cache-Control "public, must-revalidate, proxy-revalidate";
            
            # Enable gzip for HTML
            location ~* \\.html$ {
                expires -1;
                add_header Cache-Control "no-cache, no-store, must-revalidate";
            }
        }
        
        # Static assets with long cache
        location /static/ {
            expires 1y;
            add_header Cache-Control $cache_control;
            access_log off;
            
            # Enable brotli/gzip
            gzip_static on;
            brotli_static on;
        }
        
        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            # CORS headers
            add_header Access-Control-Allow-Origin "$http_origin" always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With" always;
            add_header Access-Control-Allow-Credentials true always;
            add_header Access-Control-Max-Age 3600 always;
            
            # Handle preflight requests
            if ($request_method = OPTIONS) {
                add_header Access-Control-Allow-Origin "$http_origin" always;
                add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
                add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With" always;
                add_header Access-Control-Max-Age 3600 always;
                add_header Content-Length 0;
                add_header Content-Type text/plain;
                return 204;
            }
            
            # Proxy to backend
            proxy_pass http://retrofitlink_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            
            # Timeouts
            proxy_connect_timeout 5s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
            
            # Buffer settings
            proxy_buffering on;
            proxy_buffer_size 8k;
            proxy_buffers 8 8k;
            proxy_busy_buffers_size 16k;
            
            # Health check endpoint caching
            location = /api/health {
                proxy_pass http://retrofitlink_backend;
                proxy_cache api_cache;
                proxy_cache_valid 200 1m;
                proxy_cache_key $scheme$proxy_host$request_uri;
                add_header X-Cache-Status $upstream_cache_status;
            }
        }
        
        # Authentication endpoints with stricter rate limiting
        location /api/auth/ {
            limit_req zone=login burst=5 nodelay;
            
            proxy_pass http://retrofitlink_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # No caching for auth endpoints
            proxy_cache off;
            expires -1;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }
        
        # IoT data endpoints
        location /api/iot/ {
            proxy_pass http://retrofitlink_iot;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Shorter timeouts for IoT
            proxy_connect_timeout 3s;
            proxy_send_timeout 10s;
            proxy_read_timeout 10s;
        }
        
        # Blockchain endpoints
        location /api/blockchain/ {
            proxy_pass http://retrofitlink_blockchain;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Longer timeouts for blockchain operations
            proxy_connect_timeout 10s;
            proxy_send_timeout 120s;
            proxy_read_timeout 120s;
        }
        
        # WebSocket support
        location /ws {
            proxy_pass http://retrofitlink_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket specific timeouts
            proxy_connect_timeout 7d;
            proxy_send_timeout 7d;
            proxy_read_timeout 7d;
        }
        
        # Monitoring endpoints
        location /metrics {
            stub_status on;
            access_log off;
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            allow 192.168.0.0/16;
            deny all;
        }
        
        # Error pages
        error_page 404 /404.html;
        error_page 500 502 503 504 /50x.html;
        
        location = /404.html {
            root /usr/share/nginx/html;
            internal;
        }
        
        location = /50x.html {
            root /usr/share/nginx/html;
            internal;
        }
    }
    
    # Admin subdomain
    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name admin.retrofitlink.com;
        
        # SSL certificates
        ssl_certificate /etc/ssl/certs/retrofitlink.crt;
        ssl_certificate_key /etc/ssl/private/retrofitlink.key;
        
        # Additional security for admin
        auth_basic "RetroFitLink Admin";
        auth_basic_user_file /etc/nginx/.htpasswd;
        
        # Stricter rate limiting
        limit_req zone=general burst=20 nodelay;
        limit_conn addr 10;
        
        # IP whitelist for admin access
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        # Add specific admin IP addresses
        allow 203.0.113.0/24;
        deny all;
        
        location / {
            proxy_pass http://retrofitlink_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    
    # Status page server
    server {
        listen 8080;
        server_name _;
        
        location /nginx_status {
            stub_status on;
            access_log off;
            allow 127.0.0.1;
            allow 10.0.0.0/8;
            deny all;
        }
        
        location /health {
            return 200 "healthy\\n";
            add_header Content-Type text/plain;
        }
    }
}

# Stream module for TCP/UDP load balancing
stream {
    log_format basic '$remote_addr [$time_local] '
                     '$protocol $status $bytes_sent $bytes_received '
                     '$session_time "$upstream_addr" '
                     '"$upstream_bytes_sent" "$upstream_bytes_received" "$upstream_connect_time"';
    
    access_log /var/log/nginx/stream.log basic;
    
    # MongoDB load balancing
    upstream mongodb_cluster {
        least_conn;
        server mongodb-1.retrofitlink.local:27017 weight=3 max_fails=2 fail_timeout=30s;
        server mongodb-2.retrofitlink.local:27017 weight=3 max_fails=2 fail_timeout=30s;
        server mongodb-3.retrofitlink.local:27017 weight=1 max_fails=2 fail_timeout=30s;
    }
    
    # Redis cluster load balancing
    upstream redis_cluster {
        hash $remote_addr consistent;
        server redis-1.retrofitlink.local:6379 weight=2 max_fails=1 fail_timeout=20s;
        server redis-2.retrofitlink.local:6379 weight=2 max_fails=1 fail_timeout=20s;
        server redis-3.retrofitlink.local:6379 weight=2 max_fails=1 fail_timeout=20s;
    }
    
    server {
        listen 27017;
        proxy_pass mongodb_cluster;
        proxy_timeout 1s;
        proxy_responses 1;
        proxy_connect_timeout 1s;
    }
    
    server {
        listen 6379;
        proxy_pass redis_cluster;
        proxy_timeout 1s;
        proxy_responses 1;
        proxy_connect_timeout 1s;
    }
}
`;

// HAProxy Configuration for comparison/alternative
const haproxyConfig = `
# HAProxy Configuration for RetroFitLink
global
    maxconn 4096
    log stdout local0
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

    # SSL configuration
    ssl-default-bind-ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms
    option httplog
    option dontlognull
    option http-server-close
    option forwardfor except 127.0.0.0/8
    option redispatch
    retries 3
    maxconn 2000
    
    # Error handling
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http

# Frontend configuration
frontend retrofitlink_frontend
    bind *:80
    bind *:443 ssl crt /etc/ssl/certs/retrofitlink.pem
    
    # Redirect HTTP to HTTPS
    redirect scheme https if !{ ssl_fc }
    
    # Rate limiting
    stick-table type ip size 100k expire 30s store http_req_rate(10s),gpc0
    http-request track-sc0 src
    http-request deny if { sc_http_req_rate(0) gt 20 }
    
    # Security headers
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    http-response set-header X-Frame-Options DENY
    http-response set-header X-Content-Type-Options nosniff
    http-response set-header X-XSS-Protection "1; mode=block"
    
    # Routing rules
    acl is_api path_beg /api/
    acl is_iot path_beg /api/iot/
    acl is_blockchain path_beg /api/blockchain/
    acl is_websocket hdr(upgrade) -i websocket
    acl is_static path_beg /static/
    
    # Backend selection
    use_backend retrofitlink_iot if is_iot
    use_backend retrofitlink_blockchain if is_blockchain
    use_backend retrofitlink_api if is_api
    use_backend retrofitlink_websocket if is_websocket
    use_backend retrofitlink_static if is_static
    default_backend retrofitlink_web

# Backend configurations
backend retrofitlink_api
    balance leastconn
    option httpchk GET /api/health
    
    server api1 retrofitlink-backend-1:5000 check weight 100 maxconn 100
    server api2 retrofitlink-backend-2:5000 check weight 100 maxconn 100
    server api3 retrofitlink-backend-3:5000 check weight 100 maxconn 100
    server api4 retrofitlink-backend-4:5000 check weight 50 maxconn 50 backup
    server api5 retrofitlink-backend-5:5000 check weight 50 maxconn 50 backup

backend retrofitlink_iot
    balance source
    option httpchk GET /health
    
    server iot1 retrofitlink-iot-1:6000 check weight 100
    server iot2 retrofitlink-iot-2:6000 check weight 100
    server iot3 retrofitlink-iot-3:6000 check weight 50

backend retrofitlink_blockchain
    balance uri
    hash-type consistent
    option httpchk GET /health
    
    server blockchain1 retrofitlink-blockchain-1:7000 check weight 100
    server blockchain2 retrofitlink-blockchain-2:7000 check weight 100

backend retrofitlink_web
    balance roundrobin
    option httpchk GET /
    
    server web1 retrofitlink-frontend-1:80 check weight 100
    server web2 retrofitlink-frontend-2:80 check weight 100
    server web3 retrofitlink-frontend-3:80 check weight 100

backend retrofitlink_static
    balance roundrobin
    option httpchk GET /health
    
    server static1 retrofitlink-cdn-1:80 check weight 100
    server static2 retrofitlink-cdn-2:80 check weight 100

backend retrofitlink_websocket
    balance source
    option httpchk GET /ws/health
    
    server ws1 retrofitlink-backend-1:5000 check weight 100
    server ws2 retrofitlink-backend-2:5000 check weight 100

# Statistics page
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 30s
    stats admin if TRUE
`;

// Cloud Load Balancer Configurations
const awsALBConfig = {
  loadBalancer: {
    name: "retrofitlink-alb",
    scheme: "internet-facing",
    type: "application",
    ipAddressType: "ipv4",
    subnets: [
      "subnet-12345678",
      "subnet-87654321",
      "subnet-13579246"
    ],
    securityGroups: [
      "sg-alb-retrofitlink"
    ],
    tags: [
      {
        key: "Environment",
        value: "production"
      },
      {
        key: "Application",
        value: "retrofitlink"
      }
    ]
  },
  listeners: [
    {
      port: 80,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "redirect",
          redirectConfig: {
            protocol: "HTTPS",
            port: "443",
            statusCode: "HTTP_301"
          }
        }
      ]
    },
    {
      port: 443,
      protocol: "HTTPS",
      sslPolicy: "ELBSecurityPolicy-TLS-1-2-2017-01",
      certificateArn: "arn:aws:acm:us-west-2:123456789012:certificate/12345678-1234-1234-1234-123456789012",
      defaultActions: [
        {
          type: "forward",
          targetGroupArn: "arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/retrofitlink-web/1234567890123456"
        }
      ],
      rules: [
        {
          priority: 100,
          conditions: [
            {
              field: "path-pattern",
              values: ["/api/*"]
            }
          ],
          actions: [
            {
              type: "forward",
              targetGroupArn: "arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/retrofitlink-api/1234567890123456"
            }
          ]
        },
        {
          priority: 200,
          conditions: [
            {
              field: "path-pattern",
              values: ["/api/iot/*"]
            }
          ],
          actions: [
            {
              type: "forward",
              targetGroupArn: "arn:aws:elasticloadbalancing:us-west-2:123456789012:targetgroup/retrofitlink-iot/1234567890123456"
            }
          ]
        }
      ]
    }
  ],
  targetGroups: [
    {
      name: "retrofitlink-web",
      protocol: "HTTP",
      port: 80,
      vpcId: "vpc-12345678",
      targetType: "ip",
      healthCheck: {
        path: "/",
        protocol: "HTTP",
        port: "traffic-port",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeoutSeconds: 5,
        intervalSeconds: 30,
        matcher: {
          httpCode: "200"
        }
      },
      attributes: [
        {
          key: "deregistration_delay.timeout_seconds",
          value: "30"
        },
        {
          key: "stickiness.enabled",
          value: "false"
        }
      ]
    },
    {
      name: "retrofitlink-api",
      protocol: "HTTP",
      port: 5000,
      vpcId: "vpc-12345678",
      targetType: "ip",
      healthCheck: {
        path: "/api/health",
        protocol: "HTTP",
        port: "traffic-port",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeoutSeconds: 5,
        intervalSeconds: 15,
        matcher: {
          httpCode: "200"
        }
      },
      attributes: [
        {
          key: "deregistration_delay.timeout_seconds",
          value: "15"
        },
        {
          key: "load_balancing.algorithm.type",
          value: "least_outstanding_requests"
        }
      ]
    }
  ]
};

// Google Cloud Load Balancer Configuration
const gcpLoadBalancerConfig = {
  urlMap: {
    name: "retrofitlink-url-map",
    defaultService: "projects/retrofitlink-prod/global/backendServices/retrofitlink-web",
    pathMatchers: [
      {
        name: "api-matcher",
        defaultService: "projects/retrofitlink-prod/global/backendServices/retrofitlink-api",
        pathRules: [
          {
            paths: ["/api/iot/*"],
            service: "projects/retrofitlink-prod/global/backendServices/retrofitlink-iot"
          },
          {
            paths: ["/api/blockchain/*"],
            service: "projects/retrofitlink-prod/global/backendServices/retrofitlink-blockchain"
          }
        ]
      }
    ],
    hostRules: [
      {
        hosts: ["api.retrofitlink.com"],
        pathMatcher: "api-matcher"
      }
    ]
  },
  backendServices: [
    {
      name: "retrofitlink-web",
      protocol: "HTTP",
      loadBalancingScheme: "EXTERNAL",
      backends: [
        {
          group: "projects/retrofitlink-prod/zones/us-west1-a/instanceGroups/retrofitlink-web-ig",
          balancingMode: "UTILIZATION",
          maxUtilization: 0.8,
          capacityScaler: 1.0
        }
      ],
      healthChecks: [
        "projects/retrofitlink-prod/global/healthChecks/retrofitlink-web-hc"
      ],
      sessionAffinity: "NONE",
      affinityCookieTtlSec: 0,
      timeoutSec: 30,
      connectionDraining: {
        drainingTimeoutSec: 30
      }
    }
  ],
  globalForwardingRule: {
    name: "retrofitlink-https-forwarding-rule",
    target: "projects/retrofitlink-prod/global/targetHttpsProxies/retrofitlink-https-proxy",
    portRange: "443",
    IPProtocol: "TCP",
    loadBalancingScheme: "EXTERNAL"
  }
};

module.exports = {
  nginxConfig,
  haproxyConfig,
  awsALBConfig,
  gcpLoadBalancerConfig
};
