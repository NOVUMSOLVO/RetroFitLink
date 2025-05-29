// MongoDB initialization script for RetroFitLink
// This script sets up the database with proper authentication and indexing

// Create application database
db = db.getSiblingDB('retrofitlink');

// Create application user with limited privileges
db.createUser({
  user: 'retrofitlink_user',
  pwd: 'secure_password_change_in_production',
  roles: [
    {
      role: 'readWrite',
      db: 'retrofitlink'
    }
  ]
});

// Create indexes for better performance and security

// Users collection indexes
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "role": 1 });
db.users.createIndex({ "authorityId": 1 }, { sparse: true });
db.users.createIndex({ "isActive": 1 });
db.users.createIndex({ "createdAt": 1 });

// Properties collection indexes
db.properties.createIndex({ "owner": 1 });
db.properties.createIndex({ "localAuthority": 1 });
db.properties.createIndex({ "address": "text" });
db.properties.createIndex({ "createdAt": 1 });

// Retrofits collection indexes
db.retrofits.createIndex({ "propertyId": 1 });
db.retrofits.createIndex({ "installer": 1 });
db.retrofits.createIndex({ "status": 1 });
db.retrofits.createIndex({ "createdBy": 1 });
db.retrofits.createIndex({ "createdAt": 1 });
db.retrofits.createIndex({ "propertyId": 1, "status": 1 }); // Compound index

// Verification data indexes for IoT queries
db.retrofits.createIndex({ "verificationData.timestamp": 1 });
db.retrofits.createIndex({ "verificationData.sensorId": 1 });

// Blockchain transaction indexes
db.retrofits.createIndex({ "blockchainTx": 1 }, { sparse: true });

print('Database initialization completed successfully');
print('Created user: retrofitlink_user');
print('Created indexes for users, properties, and retrofits collections');
