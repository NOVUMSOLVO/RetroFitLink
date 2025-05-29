#!/bin/bash

# Database Migration Automation Script for RetroFitLink
# This script handles database migrations for both MongoDB and PostgreSQL
# Supports multiple environments: development, staging, production

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="/tmp/retrofitlink-migration-$(date +%Y%m%d-%H%M%S).log"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
DRY_RUN=false
SKIP_BACKUP=false
MONGODB_URI=""
POSTGRES_URI=""
MIGRATION_TIMEOUT=300
ROLLBACK_ON_FAILURE=true

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "${BLUE}$@${NC}"; }
log_success() { log "SUCCESS" "${GREEN}$@${NC}"; }
log_warning() { log "WARNING" "${YELLOW}$@${NC}"; }
log_error() { log "ERROR" "${RED}$@${NC}"; }

# Help function
show_help() {
    cat << EOF
Database Migration Script for RetroFitLink

Usage: $0 [OPTIONS]

Options:
    -e, --environment ENV     Target environment (development|staging|production) [default: development]
    -d, --dry-run            Perform a dry run without executing migrations
    -s, --skip-backup        Skip database backup before migration
    -t, --timeout SECONDS   Migration timeout in seconds [default: 300]
    --no-rollback           Disable automatic rollback on failure
    --mongodb-uri URI       MongoDB connection URI (overrides environment)
    --postgres-uri URI      PostgreSQL connection URI (overrides environment)
    -h, --help              Show this help message

Examples:
    $0 --environment staging --dry-run
    $0 --environment production --timeout 600
    $0 --environment development --skip-backup

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -s|--skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            -t|--timeout)
                MIGRATION_TIMEOUT="$2"
                shift 2
                ;;
            --no-rollback)
                ROLLBACK_ON_FAILURE=false
                shift
                ;;
            --mongodb-uri)
                MONGODB_URI="$2"
                shift 2
                ;;
            --postgres-uri)
                POSTGRES_URI="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate environment
validate_environment() {
    case $ENVIRONMENT in
        development|staging|production)
            log_info "Target environment: $ENVIRONMENT"
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            log_error "Must be one of: development, staging, production"
            exit 1
            ;;
    esac
}

# Load environment configuration
load_config() {
    local config_file="$PROJECT_ROOT/.env.$ENVIRONMENT"
    
    if [[ -f "$config_file" ]]; then
        log_info "Loading configuration from $config_file"
        set -a
        source "$config_file"
        set +a
    else
        log_warning "Configuration file not found: $config_file"
        log_info "Using environment variables or defaults"
    fi

    # Set database URIs from environment if not provided via command line
    if [[ -z "$MONGODB_URI" ]]; then
        MONGODB_URI="${MONGODB_URI:-${MONGO_URL:-mongodb://localhost:27017/retrofitlink}}"
    fi
    
    if [[ -z "$POSTGRES_URI" ]]; then
        POSTGRES_URI="${POSTGRES_URI:-${DATABASE_URL:-postgresql://postgres:password@localhost:5432/retrofitlink}}"
    fi
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    local missing_deps=()
    
    # Check for required tools
    if ! command -v mongosh &> /dev/null && ! command -v mongo &> /dev/null; then
        missing_deps+=("mongosh or mongo CLI")
    fi
    
    if ! command -v psql &> /dev/null; then
        missing_deps+=("psql")
    fi
    
    if ! command -v kubectl &> /dev/null; then
        missing_deps+=("kubectl")
    fi
    
    if ! command -v node &> /dev/null; then
        missing_deps+=("node")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            log_error "  - $dep"
        done
        exit 1
    fi
    
    log_success "All dependencies found"
}

# Test database connections
test_connections() {
    log_info "Testing database connections..."
    
    # Test MongoDB connection
    if [[ "$DRY_RUN" == "false" ]]; then
        log_info "Testing MongoDB connection..."
        if command -v mongosh &> /dev/null; then
            if ! mongosh "$MONGODB_URI" --eval "db.runCommand('ping')" --quiet; then
                log_error "Failed to connect to MongoDB"
                exit 1
            fi
        else
            if ! mongo "$MONGODB_URI" --eval "db.runCommand('ping')" --quiet; then
                log_error "Failed to connect to MongoDB"
                exit 1
            fi
        fi
        log_success "MongoDB connection successful"
        
        # Test PostgreSQL connection
        log_info "Testing PostgreSQL connection..."
        if ! psql "$POSTGRES_URI" -c "SELECT 1;" > /dev/null 2>&1; then
            log_error "Failed to connect to PostgreSQL"
            exit 1
        fi
        log_success "PostgreSQL connection successful"
    else
        log_info "Skipping connection tests in dry-run mode"
    fi
}

# Create database backups
create_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_info "Skipping backup as requested"
        return
    fi
    
    local backup_dir="$PROJECT_ROOT/backups/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    
    log_info "Creating database backups in $backup_dir"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        # MongoDB backup
        log_info "Backing up MongoDB..."
        if command -v mongodump &> /dev/null; then
            mongodump --uri="$MONGODB_URI" --out="$backup_dir/mongodb" || {
                log_error "MongoDB backup failed"
                exit 1
            }
        else
            log_warning "mongodump not available, skipping MongoDB backup"
        fi
        
        # PostgreSQL backup
        log_info "Backing up PostgreSQL..."
        pg_dump "$POSTGRES_URI" > "$backup_dir/postgres.sql" || {
            log_error "PostgreSQL backup failed"
            exit 1
        }
        
        log_success "Backups completed in $backup_dir"
        echo "$backup_dir" > /tmp/retrofitlink-last-backup
    else
        log_info "Would create backups in $backup_dir (dry-run mode)"
    fi
}

# Run MongoDB migrations
run_mongodb_migrations() {
    log_info "Running MongoDB migrations..."
    
    local migrations_dir="$PROJECT_ROOT/backend/src/migrations/mongodb"
    
    if [[ ! -d "$migrations_dir" ]]; then
        log_warning "MongoDB migrations directory not found: $migrations_dir"
        return
    fi
    
    local migration_files=($(find "$migrations_dir" -name "*.js" | sort))
    
    if [[ ${#migration_files[@]} -eq 0 ]]; then
        log_info "No MongoDB migration files found"
        return
    fi
    
    for migration_file in "${migration_files[@]}"; do
        local migration_name=$(basename "$migration_file" .js)
        log_info "Running MongoDB migration: $migration_name"
        
        if [[ "$DRY_RUN" == "false" ]]; then
            if command -v mongosh &> /dev/null; then
                timeout "$MIGRATION_TIMEOUT" mongosh "$MONGODB_URI" "$migration_file" || {
                    log_error "MongoDB migration failed: $migration_name"
                    return 1
                }
            else
                timeout "$MIGRATION_TIMEOUT" mongo "$MONGODB_URI" "$migration_file" || {
                    log_error "MongoDB migration failed: $migration_name"
                    return 1
                }
            fi
        else
            log_info "Would run: $migration_file (dry-run mode)"
        fi
    done
    
    log_success "MongoDB migrations completed"
}

# Run PostgreSQL migrations
run_postgresql_migrations() {
    log_info "Running PostgreSQL migrations..."
    
    local migrations_dir="$PROJECT_ROOT/backend/src/migrations/postgresql"
    
    if [[ ! -d "$migrations_dir" ]]; then
        log_warning "PostgreSQL migrations directory not found: $migrations_dir"
        return
    fi
    
    local migration_files=($(find "$migrations_dir" -name "*.sql" | sort))
    
    if [[ ${#migration_files[@]} -eq 0 ]]; then
        log_info "No PostgreSQL migration files found"
        return
    fi
    
    for migration_file in "${migration_files[@]}"; do
        local migration_name=$(basename "$migration_file" .sql)
        log_info "Running PostgreSQL migration: $migration_name"
        
        if [[ "$DRY_RUN" == "false" ]]; then
            timeout "$MIGRATION_TIMEOUT" psql "$POSTGRES_URI" -f "$migration_file" || {
                log_error "PostgreSQL migration failed: $migration_name"
                return 1
            }
        else
            log_info "Would run: $migration_file (dry-run mode)"
        fi
    done
    
    log_success "PostgreSQL migrations completed"
}

# Run Node.js migrations (Prisma, Sequelize, etc.)
run_nodejs_migrations() {
    log_info "Running Node.js migrations..."
    
    local backend_dir="$PROJECT_ROOT/backend"
    
    if [[ ! -f "$backend_dir/package.json" ]]; then
        log_warning "Backend package.json not found, skipping Node.js migrations"
        return
    fi
    
    cd "$backend_dir"
    
    # Check for migration scripts in package.json
    if npm run | grep -q "migrate"; then
        log_info "Running npm run migrate..."
        if [[ "$DRY_RUN" == "false" ]]; then
            timeout "$MIGRATION_TIMEOUT" npm run migrate || {
                log_error "Node.js migration failed"
                return 1
            }
        else
            log_info "Would run: npm run migrate (dry-run mode)"
        fi
    elif npm run | grep -q "db:migrate"; then
        log_info "Running npm run db:migrate..."
        if [[ "$DRY_RUN" == "false" ]]; then
            timeout "$MIGRATION_TIMEOUT" npm run db:migrate || {
                log_error "Node.js migration failed"
                return 1
            }
        else
            log_info "Would run: npm run db:migrate (dry-run mode)"
        fi
    else
        log_info "No Node.js migration scripts found in package.json"
    fi
    
    cd - > /dev/null
    log_success "Node.js migrations completed"
}

# Rollback function
rollback_migrations() {
    if [[ "$ROLLBACK_ON_FAILURE" == "false" ]]; then
        log_warning "Automatic rollback disabled"
        return
    fi
    
    log_warning "Rolling back migrations..."
    
    local backup_dir
    if [[ -f "/tmp/retrofitlink-last-backup" ]]; then
        backup_dir=$(cat /tmp/retrofitlink-last-backup)
    else
        log_error "No backup directory found for rollback"
        return 1
    fi
    
    if [[ ! -d "$backup_dir" ]]; then
        log_error "Backup directory not found: $backup_dir"
        return 1
    fi
    
    # Restore MongoDB
    if [[ -d "$backup_dir/mongodb" ]]; then
        log_info "Restoring MongoDB from backup..."
        if command -v mongorestore &> /dev/null; then
            mongorestore --uri="$MONGODB_URI" --drop "$backup_dir/mongodb" || {
                log_error "MongoDB restore failed"
            }
        fi
    fi
    
    # Restore PostgreSQL
    if [[ -f "$backup_dir/postgres.sql" ]]; then
        log_info "Restoring PostgreSQL from backup..."
        psql "$POSTGRES_URI" < "$backup_dir/postgres.sql" || {
            log_error "PostgreSQL restore failed"
        }
    fi
    
    log_success "Rollback completed"
}

# Verify migrations
verify_migrations() {
    log_info "Verifying migrations..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Skipping verification in dry-run mode"
        return
    fi
    
    # Basic connectivity tests
    test_connections
    
    # Additional verification can be added here
    # For example, checking specific tables/collections exist
    
    log_success "Migration verification completed"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    
    # Remove temporary files if any
    rm -f /tmp/retrofitlink-migration-*-temp 2>/dev/null || true
    
    log_info "Cleanup completed"
}

# Main execution function
main() {
    local start_time=$(date +%s)
    
    log_info "Starting RetroFitLink database migration"
    log_info "Environment: $ENVIRONMENT"
    log_info "Dry run: $DRY_RUN"
    log_info "Log file: $LOG_FILE"
    
    # Setup trap for cleanup
    trap cleanup EXIT
    trap 'log_error "Script interrupted"; exit 1' INT TERM
    
    # Validation and setup
    validate_environment
    load_config
    check_dependencies
    test_connections
    
    # Create backup
    create_backup
    
    # Run migrations
    local migration_failed=false
    
    if ! run_mongodb_migrations; then
        migration_failed=true
    elif ! run_postgresql_migrations; then
        migration_failed=true
    elif ! run_nodejs_migrations; then
        migration_failed=true
    fi
    
    # Handle migration results
    if [[ "$migration_failed" == "true" ]]; then
        log_error "Migration failed"
        if [[ "$DRY_RUN" == "false" ]]; then
            rollback_migrations
        fi
        exit 1
    fi
    
    # Verify migrations
    verify_migrations
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "Database migration completed successfully in ${duration}s"
    log_info "Log file: $LOG_FILE"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "This was a dry run. No changes were made to the database."
    fi
}

# Parse arguments and run main function
parse_args "$@"
main
