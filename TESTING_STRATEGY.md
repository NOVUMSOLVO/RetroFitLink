# RetroFitLink Testing Strategy

## Testing Overview

This document outlines the comprehensive testing strategy for RetroFitLink to ensure quality, reliability, and security before production deployment.

## Testing Pyramid

### Unit Tests (70% of tests)
- **Backend**: Test individual functions, middleware, and utilities
- **Frontend**: Test components, hooks, and utilities
- **Smart Contracts**: Test contract functions and edge cases

### Integration Tests (20% of tests)
- **API Integration**: Test API endpoints with database
- **Frontend-Backend**: Test complete user flows
- **Blockchain Integration**: Test smart contract interactions

### End-to-End Tests (10% of tests)
- **User Journeys**: Complete user workflows
- **Cross-Service**: Multi-service interaction tests
- **Browser Compatibility**: Cross-browser testing

## Backend Testing

### Unit Tests Implementation
```javascript
// backend/tests/unit/auth.test.js
const request = require('supertest');
const app = require('../../server');
const User = require('../../models/User');

describe('Authentication', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'Resident'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(userData.email);
    });

    it('should not register user with invalid email', async () => {
      const userData = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'password123',
        role: 'Resident'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);
    });
  });
});
```

### Integration Tests
```javascript
// backend/tests/integration/retrofits.test.js
describe('Retrofits API', () => {
  let authToken;
  let userId;

  beforeEach(async () => {
    // Setup test user and get auth token
    const user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'Resident'
    });
    
    authToken = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET);
    userId = user._id;
  });

  it('should create a new retrofit project', async () => {
    const property = await Property.create({
      address: '123 Test St',
      owner: userId,
      propertyType: 'House',
      localAuthority: 'Test Council'
    });

    const retrofitData = {
      propertyId: property._id,
      type: 'Heat Pump',
      status: 'Planned'
    };

    const response = await request(app)
      .post('/api/retrofits')
      .set('Authorization', `Bearer ${authToken}`)
      .send(retrofitData)
      .expect(201);

    expect(response.body.type).toBe('Heat Pump');
  });
});
```

## Frontend Testing

### Component Tests
```javascript
// frontend/src/components/__tests__/Navbar.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import Navbar from '../Navbar';

const renderNavbar = (authValue) => {
  return render(
    <BrowserRouter>
      <AuthContext.Provider value={authValue}>
        <Navbar />
      </AuthContext.Provider>
    </BrowserRouter>
  );
};

describe('Navbar', () => {
  it('should display login button when user is not authenticated', () => {
    const authValue = { user: null, logout: jest.fn() };
    renderNavbar(authValue);
    
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
  });

  it('should display user info when authenticated', () => {
    const user = { name: 'John Doe', role: 'Resident' };
    const authValue = { user, logout: jest.fn() };
    renderNavbar(authValue);
    
    expect(screen.getByText('Hello, John Doe')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });
});
```

### Hook Tests
```javascript
// frontend/src/hooks/__tests__/useAuth.test.js
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import axios from 'axios';

jest.mock('axios');

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    axios.post.mockClear();
  });

  it('should login user successfully', async () => {
    const mockResponse = {
      data: {
        token: 'mock-token',
        user: { id: '1', name: 'John Doe', email: 'john@example.com' }
      }
    };
    axios.post.mockResolvedValue(mockResponse);

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const response = await result.current.login('john@example.com', 'password');
      expect(response.success).toBe(true);
    });

    expect(result.current.user).toEqual(mockResponse.data.user);
    expect(localStorage.getItem('token')).toBe('mock-token');
  });
});
```

## Smart Contract Testing

### Contract Unit Tests
```javascript
// blockchain/test/RetrofitVerification.advanced.test.js
describe("RetrofitVerification Advanced", function () {
  let contract;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const RetrofitVerification = await ethers.getContractFactory("RetrofitVerification");
    contract = await RetrofitVerification.deploy();
    await contract.deployed();
  });

  describe("Access Control", function () {
    it("Should only allow authorized users to add records", async function () {
      // Test authorization logic when implemented
    });
  });

  describe("Data Integrity", function () {
    it("Should prevent duplicate records", async function () {
      await contract.addVerificationRecord(1, 1, "0x123");
      
      await expect(
        contract.addVerificationRecord(1, 1, "0x123")
      ).to.be.revertedWith("Record already exists");
    });

    it("Should validate sensor data hash format", async function () {
      await expect(
        contract.addVerificationRecord(1, 1, "invalid-hash")
      ).to.be.revertedWith("Invalid hash format");
    });
  });

  describe("Gas Optimization", function () {
    it("Should use reasonable gas for record addition", async function () {
      const tx = await contract.addVerificationRecord(1, 1, "0x123");
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.below(100000);
    });
  });
});
```

## End-to-End Testing

### Cypress E2E Tests
```javascript
// cypress/integration/user-registration.spec.js
describe('User Registration Flow', () => {
  beforeEach(() => {
    cy.visit('/register');
  });

  it('should complete resident registration successfully', () => {
    cy.get('[data-testid=name-input]').type('John Doe');
    cy.get('[data-testid=email-input]').type('john@example.com');
    cy.get('[data-testid=password-input]').type('SecurePassword123');
    cy.get('[data-testid=confirm-password-input]').type('SecurePassword123');
    cy.get('[data-testid=role-select]').select('Resident');
    cy.get('[data-testid=address-input]').type('123 Main St, City');
    
    cy.get('[data-testid=register-button]').click();
    
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid=welcome-message]').should('contain', 'Welcome, John Doe');
  });

  it('should show validation errors for invalid data', () => {
    cy.get('[data-testid=register-button]').click();
    
    cy.get('[data-testid=name-error]').should('be.visible');
    cy.get('[data-testid=email-error]').should('be.visible');
    cy.get('[data-testid=password-error]').should('be.visible');
  });
});
```

### Multi-Service Integration Tests
```javascript
// cypress/integration/retrofit-workflow.spec.js
describe('Complete Retrofit Workflow', () => {
  it('should complete full retrofit lifecycle', () => {
    // Login as resident
    cy.login('resident@example.com', 'password');
    
    // Create property
    cy.get('[data-testid=add-property-button]').click();
    cy.fillPropertyForm({
      address: '123 Test Street',
      type: 'House',
      yearBuilt: '1990'
    });
    
    // Submit retrofit application
    cy.get('[data-testid=apply-retrofit-button]').click();
    cy.fillRetrofitForm({
      type: 'Heat Pump',
      description: 'Air source heat pump installation'
    });
    
    // Switch to installer account
    cy.logout();
    cy.login('installer@example.com', 'password');
    
    // Accept and complete retrofit
    cy.get('[data-testid=available-jobs]').contains('Heat Pump').click();
    cy.get('[data-testid=accept-job-button]').click();
    cy.get('[data-testid=mark-complete-button]').click();
    
    // Switch to authority account
    cy.logout();
    cy.login('authority@example.com', 'password');
    
    // Verify completion
    cy.get('[data-testid=pending-verifications]').contains('Heat Pump').click();
    cy.get('[data-testid=verify-button]').click();
    
    // Check blockchain verification
    cy.get('[data-testid=blockchain-status]').should('contain', 'Verified');
  });
});
```

## Performance Testing

### Load Testing with Artillery
```yaml
# tests/performance/load-test.yml
config:
  target: 'http://localhost:5000'
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 50
    - duration: 60
      arrivalRate: 100
  defaults:
    headers:
      Content-Type: 'application/json'

scenarios:
  - name: "User Registration and Login"
    weight: 40
    flow:
      - post:
          url: "/api/auth/register"
          json:
            name: "Test User {{ $randomString() }}"
            email: "test{{ $randomString() }}@example.com"
            password: "password123"
            role: "Resident"
      - post:
          url: "/api/auth/login"
          json:
            email: "{{ email }}"
            password: "password123"
          capture:
            - json: "$.token"
              as: "authToken"

  - name: "Get Retrofits"
    weight: 60
    flow:
      - get:
          url: "/api/retrofits"
          headers:
            Authorization: "Bearer {{ authToken }}"
```

## Security Testing

### OWASP Security Tests
```javascript
// tests/security/security.test.js
describe('Security Tests', () => {
  describe('SQL Injection Prevention', () => {
    it('should prevent NoSQL injection in login', async () => {
      const maliciousPayload = {
        email: { $ne: null },
        password: { $ne: null }
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(maliciousPayload)
        .expect(400);
      
      expect(response.body.message).toContain('validation error');
    });
  });

  describe('Rate Limiting', () => {
    it('should block requests after rate limit exceeded', async () => {
      const requests = Array(110).fill().map(() => 
        request(app).post('/api/auth/login').send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
      );

      const responses = await Promise.all(requests);
      const blockedResponses = responses.filter(r => r.status === 429);
      
      expect(blockedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validation', () => {
    it('should sanitize XSS attempts', async () => {
      const xssPayload = {
        name: '<script>alert("xss")</script>',
        email: 'test@example.com',
        password: 'password123',
        role: 'Resident'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(xssPayload)
        .expect(400);
      
      expect(response.body.message).toContain('validation error');
    });
  });
});
```

## Test Automation

### GitHub Actions CI/CD
```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:5.0
        options: >-
          --health-cmd mongo
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 27017:27017

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '16'
        cache: 'npm'
        cache-dependency-path: backend/package-lock.json
    
    - name: Install dependencies
      run: |
        cd backend
        npm ci
    
    - name: Run unit tests
      run: |
        cd backend
        npm test
      env:
        MONGO_URI: mongodb://localhost:27017/test
        JWT_SECRET: test-secret
    
    - name: Run integration tests
      run: |
        cd backend
        npm run test:integration

  frontend-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '16'
        cache: 'npm'
        cache-dependency-path: frontend/package-lock.json
    
    - name: Install dependencies
      run: |
        cd frontend
        npm ci
    
    - name: Run tests
      run: |
        cd frontend
        npm test -- --coverage --watchAll=false
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3

  blockchain-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '16'
        cache: 'npm'
        cache-dependency-path: blockchain/package-lock.json
    
    - name: Install dependencies
      run: |
        cd blockchain
        npm ci
    
    - name: Compile contracts
      run: |
        cd blockchain
        npx hardhat compile
    
    - name: Run contract tests
      run: |
        cd blockchain
        npx hardhat test

  e2e-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '16'
    
    - name: Start application
      run: |
        docker-compose up -d
        sleep 30
    
    - name: Run Cypress tests
      uses: cypress-io/github-action@v4
      with:
        wait-on: 'http://localhost:3000'
        wait-on-timeout: 120
        record: true
      env:
        CYPRESS_RECORD_KEY: ${{ secrets.CYPRESS_RECORD_KEY }}
    
    - name: Stop application
      run: docker-compose down
```

## Test Coverage Requirements

### Minimum Coverage Targets
- **Backend**: 80% line coverage, 70% branch coverage
- **Frontend**: 75% line coverage, 65% branch coverage
- **Smart Contracts**: 90% line coverage, 85% branch coverage

### Critical Path Coverage
- **Authentication flows**: 100% coverage
- **Payment processing**: 100% coverage
- **Blockchain interactions**: 95% coverage
- **Data validation**: 90% coverage

## Test Data Management

### Test Data Strategy
```javascript
// tests/fixtures/testData.js
const testUsers = {
  resident: {
    name: 'John Resident',
    email: 'resident@test.com',
    password: 'TestPassword123',
    role: 'Resident',
    address: '123 Test Street'
  },
  installer: {
    name: 'Jane Installer',
    email: 'installer@test.com',
    password: 'TestPassword123',
    role: 'Installer',
    certifications: ['Gas Safe', 'NICEIC']
  },
  authority: {
    name: 'Council Authority',
    email: 'authority@test.com',
    password: 'TestPassword123',
    role: 'Local Authority',
    authorityId: 'TEST_COUNCIL_001'
  }
};

const testProperties = {
  sampleHouse: {
    address: '123 Test Street',
    propertyType: 'House',
    energyRating: 'D',
    yearBuilt: 1985,
    area: 120,
    localAuthority: 'Test Council'
  }
};

module.exports = {
  testUsers,
  testProperties
};
```

## Monitoring & Reporting

### Test Results Dashboard
- **Real-time test execution status**
- **Coverage reports and trends**
- **Performance test results**
- **Security scan results**
- **Flaky test identification**

### Notification Strategy
- **Slack integration for test failures**
- **Email reports for nightly test runs**
- **Dashboard alerts for coverage drops**
- **Security vulnerability notifications**

---

**Document Version**: 1.0  
**Last Updated**: May 2025  
**Review Cycle**: Monthly  
**Owner**: QA & Development Team
