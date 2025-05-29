const { MongoClient, ClientEncryption, Binary } = require('mongodb');
const crypto = require('crypto');

/**
 * MongoDB Client-Side Field Level Encryption (CSFLE) configuration
 */
class EncryptionService {
  constructor() {
    this.client = null;
    this.clientEncryption = null;
    this.keyVaultNamespace = 'retrofitlink.__keyVault';
    this.dataKeyId = null;
  }

  /**
   * Initialize encryption service
   */
  async initialize() {
    try {
      // KMS providers configuration
      const kmsProviders = {
        local: {
          key: Buffer.from(process.env.MASTER_KEY || this.generateMasterKey(), 'base64')
        }
      };

      // Schema map for automatic encryption
      const schemaMap = {
        'retrofitlink.users': {
          bsonType: 'object',
          encryptMetadata: {
            keyId: [Binary.createFromBase64(process.env.DEK_ID || await this.createDataKey(), 4)]
          },
          properties: {
            email: {
              encrypt: {
                bsonType: 'string',
                algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
              }
            },
            personalDetails: {
              encrypt: {
                bsonType: 'object',
                algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
              }
            },
            phoneNumber: {
              encrypt: {
                bsonType: 'string',
                algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
              }
            }
          }
        },
        'retrofitlink.properties': {
          bsonType: 'object',
          encryptMetadata: {
            keyId: [Binary.createFromBase64(process.env.DEK_ID || await this.createDataKey(), 4)]
          },
          properties: {
            address: {
              encrypt: {
                bsonType: 'object',
                algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
              }
            },
            energyData: {
              encrypt: {
                bsonType: 'object',
                algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
              }
            }
          }
        }
      };

      // Auto encryption options
      const autoEncryptionOpts = {
        keyVaultNamespace: this.keyVaultNamespace,
        kmsProviders,
        schemaMap,
        extraOptions: {
          mongocryptdBypassSpawn: true,
          mongocryptdSpawnPath: process.env.MONGOCRYPTD_PATH
        }
      };

      // Create encrypted client
      this.client = new MongoClient(process.env.MONGODB_URI, {
        autoEncryption: autoEncryptionOpts
      });

      await this.client.connect();

      // Create client encryption for manual operations
      this.clientEncryption = new ClientEncryption(this.client, {
        keyVaultNamespace: this.keyVaultNamespace,
        kmsProviders
      });

      console.log('Encryption service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize encryption service:', error);
      throw error;
    }
  }

  /**
   * Generate a master key for local KMS
   */
  generateMasterKey() {
    const masterKey = crypto.randomBytes(96);
    console.log('Generated master key (store securely):', masterKey.toString('base64'));
    return masterKey.toString('base64');
  }

  /**
   * Create a data encryption key
   */
  async createDataKey() {
    try {
      if (!this.clientEncryption) {
        await this.initialize();
      }

      const dataKeyId = await this.clientEncryption.createDataKey('local', {
        keyAltNames: ['retrofitlink-dek']
      });

      console.log('Created data key:', dataKeyId.toString('base64'));
      return dataKeyId.toString('base64');
    } catch (error) {
      console.error('Failed to create data key:', error);
      throw error;
    }
  }

  /**
   * Manually encrypt a field
   */
  async encryptField(value, algorithm = 'AEAD_AES_256_CBC_HMAC_SHA_512-Random') {
    try {
      if (!this.clientEncryption) {
        await this.initialize();
      }

      const dataKeyId = Binary.createFromBase64(process.env.DEK_ID, 4);
      
      return await this.clientEncryption.encrypt(value, {
        keyId: dataKeyId,
        algorithm
      });
    } catch (error) {
      console.error('Failed to encrypt field:', error);
      throw error;
    }
  }

  /**
   * Manually decrypt a field
   */
  async decryptField(encryptedValue) {
    try {
      if (!this.clientEncryption) {
        await this.initialize();
      }

      return await this.clientEncryption.decrypt(encryptedValue);
    } catch (error) {
      console.error('Failed to decrypt field:', error);
      throw error;
    }
  }

  /**
   * Get encrypted database connection
   */
  getEncryptedClient() {
    return this.client;
  }

  /**
   * Create collection with encryption schema
   */
  async createEncryptedCollection(dbName, collectionName, validator) {
    try {
      const db = this.client.db(dbName);
      
      return await db.createCollection(collectionName, {
        validator
      });
    } catch (error) {
      console.error(`Failed to create encrypted collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Setup key vault collection with proper indexes
   */
  async setupKeyVault() {
    try {
      const [dbName, collectionName] = this.keyVaultNamespace.split('.');
      const keyVaultDB = this.client.db(dbName);
      const keyVaultColl = keyVaultDB.collection(collectionName);

      // Create unique index on keyAltNames
      await keyVaultColl.createIndex(
        { keyAltNames: 1 },
        {
          unique: true,
          partialFilterExpression: { keyAltNames: { $exists: true } }
        }
      );

      console.log('Key vault setup completed');
    } catch (error) {
      console.error('Failed to setup key vault:', error);
      throw error;
    }
  }

  /**
   * Rotate data encryption key
   */
  async rotateDataKey(keyId) {
    try {
      if (!this.clientEncryption) {
        await this.initialize();
      }

      // Create new data key
      const newDataKeyId = await this.createDataKey();

      // In a production system, you would:
      // 1. Update all documents encrypted with the old key
      // 2. Re-encrypt with the new key
      // 3. Remove the old key from the key vault
      
      console.log('Data key rotation completed. New key ID:', newDataKeyId);
      return newDataKeyId;
    } catch (error) {
      console.error('Failed to rotate data key:', error);
      throw error;
    }
  }

  /**
   * Close encryption service
   */
  async close() {
    try {
      if (this.clientEncryption) {
        await this.clientEncryption.close();
      }
      if (this.client) {
        await this.client.close();
      }
    } catch (error) {
      console.error('Error closing encryption service:', error);
    }
  }
}

// Singleton instance
let encryptionService = null;

/**
 * Get or create encryption service instance
 */
const getEncryptionService = async () => {
  if (!encryptionService) {
    encryptionService = new EncryptionService();
    await encryptionService.initialize();
  }
  return encryptionService;
};

module.exports = {
  EncryptionService,
  getEncryptionService
};
