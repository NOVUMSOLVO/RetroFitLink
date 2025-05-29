const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');

class MFAService {
  /**
   * Generate MFA secret and QR code for user
   * @param {string} userEmail - User's email address
   * @param {string} userName - User's display name
   * @returns {Object} Contains secret, QR code data URL, and backup codes
   */
  static async generateMFASecret(userEmail, userName) {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${userName} (${userEmail})`,
      issuer: 'RetroFitLink',
      length: 32
    });

    // Generate QR code
    const qrCodeDataURL = await qrcode.toDataURL(secret.otpauth_url);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    return {
      secret: secret.base32,
      qrCode: qrCodeDataURL,
      backupCodes,
      manualEntryKey: secret.base32
    };
  }

  /**
   * Verify TOTP token
   * @param {string} token - 6-digit TOTP token
   * @param {string} secret - User's MFA secret
   * @param {number} window - Time window for validation (default: 2)
   * @returns {boolean} True if token is valid
   */
  static verifyTOTP(token, secret, window = 2) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window
    });
  }

  /**
   * Generate backup codes for MFA recovery
   * @param {number} count - Number of backup codes to generate
   * @returns {Array} Array of backup codes
   */
  static generateBackupCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  /**
   * Verify backup code
   * @param {string} inputCode - User-provided backup code
   * @param {Array} storedCodes - Array of user's backup codes
   * @returns {Object} Contains isValid and remainingCodes
   */
  static verifyBackupCode(inputCode, storedCodes) {
    const normalizedInput = inputCode.replace(/\s|-/g, '').toUpperCase();
    const codeIndex = storedCodes.findIndex(code => 
      code.replace(/\s|-/g, '').toUpperCase() === normalizedInput
    );

    if (codeIndex === -1) {
      return { isValid: false, remainingCodes: storedCodes };
    }

    // Remove used backup code
    const remainingCodes = storedCodes.filter((_, index) => index !== codeIndex);
    
    return { isValid: true, remainingCodes };
  }

  /**
   * Hash backup codes for secure storage
   * @param {Array} codes - Array of backup codes
   * @returns {Array} Array of hashed backup codes
   */
  static hashBackupCodes(codes) {
    return codes.map(code => {
      return crypto
        .createHash('sha256')
        .update(code + process.env.BACKUP_CODE_SALT)
        .digest('hex');
    });
  }

  /**
   * Verify hashed backup code
   * @param {string} inputCode - User-provided backup code
   * @param {Array} hashedCodes - Array of hashed backup codes
   * @returns {Object} Contains isValid and remainingCodes
   */
  static verifyHashedBackupCode(inputCode, hashedCodes) {
    const inputHash = crypto
      .createHash('sha256')
      .update(inputCode + process.env.BACKUP_CODE_SALT)
      .digest('hex');

    const codeIndex = hashedCodes.findIndex(hash => hash === inputHash);

    if (codeIndex === -1) {
      return { isValid: false, remainingCodes: hashedCodes };
    }

    // Remove used backup code
    const remainingCodes = hashedCodes.filter((_, index) => index !== codeIndex);
    
    return { isValid: true, remainingCodes };
  }

  /**
   * Generate time-based recovery code (valid for 30 minutes)
   * @param {string} userId - User ID
   * @returns {string} Recovery code
   */
  static generateRecoveryCode(userId) {
    const timestamp = Math.floor(Date.now() / (30 * 60 * 1000)); // 30-minute window
    const data = `${userId}:${timestamp}:${process.env.RECOVERY_SECRET}`;
    
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex')
      .substring(0, 12)
      .toUpperCase();
  }

  /**
   * Verify recovery code
   * @param {string} code - Recovery code to verify
   * @param {string} userId - User ID
   * @returns {boolean} True if code is valid
   */
  static verifyRecoveryCode(code, userId) {
    const currentWindow = Math.floor(Date.now() / (30 * 60 * 1000));
    
    // Check current and previous time window
    for (let window = currentWindow; window >= currentWindow - 1; window--) {
      const data = `${userId}:${window}:${process.env.RECOVERY_SECRET}`;
      const expectedCode = crypto
        .createHash('sha256')
        .update(data)
        .digest('hex')
        .substring(0, 12)
        .toUpperCase();
      
      if (expectedCode === code.toUpperCase()) {
        return true;
      }
    }
    
    return false;
  }
}

module.exports = MFAService;
