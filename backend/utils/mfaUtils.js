const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * MFA Utilities for RetroFitLink authentication
 * Handles Time-based One-Time Password (TOTP) generation and verification
 */
const mfaUtils = {
  /**
   * Generate a new secret key for MFA
   * @returns {Object} Object containing secret in various formats
   */
  generateSecret: (email) => {
    return speakeasy.generateSecret({
      name: `RetroFitLink:${email}`,
      length: 20
    });
  },

  /**
   * Generate QR Code for MFA setup
   * @param {String} secret The secret in otpauth URL format
   * @returns {Promise<String>} QR code as data URL
   */
  generateQRCode: async (otpauthUrl) => {
    try {
      return await QRCode.toDataURL(otpauthUrl);
    } catch (error) {
      throw new Error('Failed to generate QR code');
    }
  },

  /**
   * Verify a TOTP token
   * @param {String} token The token to verify
   * @param {String} secret The user's secret
   * @returns {Boolean} Whether the token is valid
   */
  verifyToken: (token, secret) => {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1 // Allow 1 step before/after for clock drift
    });
  },

  /**
   * Generate backup codes for MFA recovery
   * @param {Number} count Number of backup codes to generate
   * @returns {Array<String>} Array of backup codes
   */
  generateBackupCodes: (count = 10) => {
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      // Format as 'XXXX-XXXX'
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
    }
    return codes;
  },

  /**
   * Hash backup codes for secure storage
   * @param {Array<String>} codes Array of backup codes
   * @returns {Array<String>} Array of hashed backup codes
   */
  hashBackupCodes: (codes) => {
    return codes.map(code => {
      const hash = crypto.createHash('sha256');
      hash.update(code);
      return hash.digest('hex');
    });
  }
};

module.exports = mfaUtils;