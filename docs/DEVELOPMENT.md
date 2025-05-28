# Development Guide

This document provides instructions for setting up a local development environment for RetroFitLink.

## Prerequisites

- Node.js (v16 or later)
- Docker and Docker Compose
- MongoDB (local installation or Docker container)
- Git

## Setup Instructions

1. Clone the repository:

```bash
git clone https://github.com/NOVUMSOLVO/RetroFitLink.git
cd RetroFitLink
```

2. Install dependencies:

```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

3. Set up environment variables:

```bash
# Copy example environment files
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env

# Edit .env files with your local configuration
```

4. Start development services using Docker Compose:

```bash
docker-compose -f docker-compose.dev.yml up
```

5. Access the application:
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:5000](http://localhost:5000)
   - API Documentation: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)

## Development Workflow

1. Create a new branch for your feature or bug fix:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and commit them:

```bash
git add .
git commit -m "Add feature or fix bug description"
```

3. Push your branch and create a pull request:

```bash
git push origin feature/your-feature-name
```

4. After code review, your changes will be merged into the main branch.

## Testing

```bash
# Run frontend tests
cd frontend
npm test

# Run backend tests
cd backend
npm test
```

## Building for Production

```bash
# Build frontend
cd frontend
npm run build

# Build backend
cd backend
npm run build
```

## Documentation

Please update relevant documentation when making changes to the codebase.

---

For additional help, contact the development team at [dev@example.com](mailto:dev@example.com).