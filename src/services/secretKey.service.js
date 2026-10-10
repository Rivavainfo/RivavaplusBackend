const crypto = require('crypto');
const { admin } = require('../config/firebase');
const logger = require('../utils/logger');
const NotificationService = require('./notification.service');

const KEY_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

class SecretKeyService {
  /**
   * Temporary Feature Flag to switch between temporary formula validation and legacy Firebase key verification.
   */
  static USE_TEMPORARY_FORMULA_KEY = true;

  /**
   * Computes expected temporary secret key based on account details.
   * Formula: EmailPrefix (2 chars lowercase) + MonthNumber (2 digits) + MobilePrefix (3 digits) + "Riva"
   */
  static generateFormulaKey({ email, phone, date = new Date() }) {
    if (!email || typeof email !== 'string') {
      return { success: false, code: 'INVALID_EMAIL', message: 'Valid email address is required.' };
    }

    const emailParts = email.trim().split('@');
    const localPart = emailParts[0] || '';
    if (localPart.length < 2) {
      return { success: false, code: 'EMAIL_TOO_SHORT', message: 'Account email local part must contain at least 2 characters.' };
    }

    const emailPrefix = localPart.substring(0, 2).toLowerCase();

    // Month formatting (01 - 12)
    const monthNum = (date.getMonth() + 1).toString().padStart(2, '0');

    if (!phone || typeof phone !== 'string') {
      return {
        success: false,
        code: 'MISSING_MOBILE_NUMBER',
        message: 'Please add your mobile number to your profile before unlocking Portfolio.'
      };
    }

    // Normalize phone number: remove non-digits
    let rawDigits = phone.replace(/\D/g, '');

    // Handle Indian country code +91 or 91 prefix when length is 12 digits
    if (rawDigits.length === 12 && rawDigits.startsWith('91')) {
      rawDigits = rawDigits.substring(2);
    } else if (rawDigits.length > 10 && rawDigits.startsWith('91')) {
      rawDigits = rawDigits.substring(2);
    }

    if (rawDigits.length < 3) {
      return {
        success: false,
        code: 'MISSING_MOBILE_NUMBER',
        message: 'Please add your mobile number to your profile before unlocking Portfolio.'
      };
    }

    const mobilePrefix = rawDigits.substring(0, 3);
    const suffix = 'Riva';

    const expectedKey = `${emailPrefix}${monthNum}${mobilePrefix}${suffix}`;

    return {
      success: true,
      expectedKey,
      emailPrefix,
      monthNum,
      mobilePrefix,
      suffix
    };
  }

  /**
   * Generate a cryptographically secure license key string.
   */
  static generateRandomKeyString(prefix = 'RIV') {
    const segments = 4;
    const segmentLength = 4;
    const parts = [prefix];

    for (let s = 0; s < segments; s++) {
      let part = '';
      const randomBytes = crypto.randomBytes(segmentLength);
      for (let i = 0; i < segmentLength; i++) {
        const index = randomBytes[i] % KEY_CHARSET.length;
        part += KEY_CHARSET[index];
      }
      parts.push(part);
    }

    return parts.join('-');
  }

  /**
   * Normalizes a user-input key.
   */
  static normalizeKey(keyString) {
    if (!keyString) return '';
    return keyString.trim().toUpperCase().replace(/[\s_]/g, '-');
  }

  /**
   * Generates and stores new secure keys in Firebase Firestore.
   */
  static async createSecretKey({
    tier = 'portfolio_premium',
    maxUses = 1,
    prefix = 'RIV',
    assignedEmail = null,
    expiresInDays = null,
    notes = '',
    createdBy = 'system_admin'
  } = {}) {
    const rawKey = this.generateRandomKeyString(prefix);
    const now = Date.now();
    const expiresAt = expiresInDays ? (now + expiresInDays * 24 * 60 * 60 * 1000) : null;
    const cleanEmail = assignedEmail ? assignedEmail.toLowerCase().trim() : null;

    const keyData = {
      keyString: rawKey,
      tier,
      maxUses: Number(maxUses) || 1,
      currentUses: 0,
      assignedEmail: cleanEmail,
      expiresAt,
      notes,
      createdBy,
      isActive: true,
      status: 'active',
      redeemedBy: [],
      createdAt: now
    };

    await admin.firestore().collection('secret_keys').doc(rawKey).set(keyData);
    logger.info(`Secret key generated in Firebase Firestore: ${rawKey}`);

    return {
      key: rawKey,
      tier,
      maxUses: Number(maxUses) || 1,
      assignedEmail: cleanEmail,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      createdAt: new Date(now).toISOString()
    };
  }

  /**
   * Validates a secret key in Firebase Firestore without redeeming it.
   */
  static async validateSecretKey(rawKey, userEmail = null) {
    const normalizedKey = this.normalizeKey(rawKey);
    if (!normalizedKey || normalizedKey.length < 8) {
      return { isValid: false, code: 'INVALID_FORMAT', message: 'Invalid key format.' };
    }

    const doc = await admin.firestore().collection('secret_keys').doc(normalizedKey).get();
    if (!doc.exists) {
      return { isValid: false, code: 'NOT_FOUND', message: 'Secret key not found.' };
    }

    const keyRecord = doc.data();

    if (!keyRecord.isActive || keyRecord.status === 'revoked') {
      return { isValid: false, code: 'KEY_REVOKED', message: 'This secret key has been revoked.' };
    }

    if (keyRecord.expiresAt && Date.now() > keyRecord.expiresAt) {
      return { isValid: false, code: 'KEY_EXPIRED', message: 'This secret key has expired.' };
    }

    if (keyRecord.assignedEmail && userEmail) {
      if (keyRecord.assignedEmail.toLowerCase() !== userEmail.toLowerCase()) {
        return { isValid: false, code: 'EMAIL_MISMATCH', message: 'This key was assigned to a different account.' };
      }
    }

    const currentUses = Number(keyRecord.currentUses) || 0;
    const maxUses = Number(keyRecord.maxUses) || 1;

    if (currentUses >= maxUses) {
      return { isValid: false, code: 'ALREADY_REDEEMED', message: 'This key has reached maximum uses.' };
    }

    return {
      isValid: true,
      key: normalizedKey,
      tier: keyRecord.tier || 'portfolio_premium',
      usesRemaining: maxUses - currentUses
    };
  }

  /**
   * Atomically redeems a secret key and unlocks user in Firebase Firestore.
   */
  static async redeemSecretKey({ keyString, userId, userEmail = null, userPhone = null }) {
    if (!keyString || !keyString.trim()) {
      return { success: false, code: 'EMPTY_KEY', message: 'Secret key is required.' };
    }

    if (!userId) {
      return { success: false, code: 'UNAUTHORIZED', message: 'User ID is required.' };
    }

    if (this.USE_TEMPORARY_FORMULA_KEY) {
      return this.redeemFormulaSecretKey({ keyString, userId, userEmail, userPhone });
    }

    return this.redeemSecretKeyFirebaseLegacy({ keyString, userId, userEmail });
  }

  /**
   * Temporary formula secret key redemption logic.
   */
  static async redeemFormulaSecretKey({ keyString, userId, userEmail = null, userPhone = null }) {
    const UserService = require('./user.service');
    let email = userEmail;
    let phone = userPhone;

    if (!email || !phone) {
      try {
        const profile = await UserService.getProfile(userId);
        email = email || profile.email;
        phone = phone || profile.phone;
      } catch (err) {
        logger.warn(`Could not fetch profile for temporary key check: ${err.message}`);
      }
    }

    const keyCalculation = this.generateFormulaKey({ email, phone });
    if (!keyCalculation.success) {
      return {
        success: false,
        code: keyCalculation.code,
        message: keyCalculation.message
      };
    }

    const cleanInputKey = keyString.trim();

    if (cleanInputKey !== keyCalculation.expectedKey) {
      return {
        success: false,
        code: 'INVALID_SECRET_KEY',
        message: 'Invalid Secret Key.'
      };
    }

    // Key is correct - update local Portfolio unlock state in user profile in therivdata
    const now = Date.now();
    try {
      await admin.firestore().collection('therivdata').doc(userId).set({
        premiumStatus: true,
        isPremium: true,
        premium_source: 'temporary_formula_key',
        temporaryUnlockedAt: now,
        updatedAt: now
      }, { merge: true });
    } catch (err) {
      logger.warn(`Firestore update notice for formula key unlock: ${err.message}`);
    }

    return {
      success: true,
      tier: 'portfolio_premium',
      code: 'SUCCESS',
      message: 'Secret key verified successfully. Portfolio unlocked!'
    };
  }

  /**
   * Legacy Firebase Firestore secret key redemption transaction logic.
   */
  static async redeemSecretKeyFirebaseLegacy({ keyString, userId, userEmail = null }) {
    const normalizedKey = this.normalizeKey(keyString);
    const firestore = admin.firestore();
    const keyRef = firestore.collection('secret_keys').doc(normalizedKey);
    const userRef = firestore.collection('therivdata').doc(userId);
    const now = Date.now();

    try {
      const result = await firestore.runTransaction(async (transaction) => {
        const keyDoc = await transaction.get(keyRef);
        if (!keyDoc.exists) {
          return { success: false, code: 'NOT_FOUND', message: 'Secret key not found.' };
        }

        const keyData = keyDoc.data();
        if (!keyData.isActive || keyData.status === 'revoked') {
          return { success: false, code: 'KEY_REVOKED', message: 'This secret key has been revoked.' };
        }

        if (keyData.expiresAt && now > keyData.expiresAt) {
          return { success: false, code: 'KEY_EXPIRED', message: 'This secret key has expired.' };
        }

        if (keyData.assignedEmail && userEmail) {
          if (keyData.assignedEmail.toLowerCase() !== userEmail.toLowerCase()) {
            return { success: false, code: 'EMAIL_MISMATCH', message: 'This key was issued for a different account.' };
          }
        }

        const currentUses = Number(keyData.currentUses) || 0;
        const maxUses = Number(keyData.maxUses) || 1;

        if (currentUses >= maxUses) {
          return { success: false, code: 'ALREADY_REDEEMED', message: 'This secret key has reached maximum uses.' };
        }

        const redeemedBy = keyData.redeemedBy || [];
        if (redeemedBy.some(r => r.userId === userId)) {
          return { success: false, code: 'ALREADY_CLAIMED', message: 'You have already activated this key.' };
        }

        const newUses = currentUses + 1;
        const newStatus = newUses >= maxUses ? 'redeemed' : 'active';
        const redemptionEntry = {
          userId,
          userEmail: userEmail || '',
          redeemedAt: now
        };

        // 1. Update key document in Firestore
        transaction.update(keyRef, {
          currentUses: newUses,
          status: newStatus,
          redeemedBy: [...redeemedBy, redemptionEntry],
          lastRedeemedAt: now,
          updatedAt: now
        });

        // 2. Unlock User in Firestore therivdata collection
        transaction.set(userRef, {
          premiumStatus: true,
          isPremium: true,
          premium_source: 'secret_key',
          redeemedSecretKey: normalizedKey,
          updatedAt: now
        }, { merge: true });

        return {
          success: true,
          tier: keyData.tier || 'portfolio_premium',
          message: 'Secret key redeemed successfully. Access unlocked!'
        };
      });

      if (result.success) {
        NotificationService.sendToUser(userId, {
          title: '🎉 Secret Key Activated!',
          body: `Your account has been upgraded to ${String(result.tier).toUpperCase()} tier.`,
          data: { type: 'KEY_REDEEMED', key: normalizedKey }
        }).catch(() => {});
        logger.info(`Secret key ${normalizedKey} redeemed in Firestore for user ${userId}`);
      }

      return result;
    } catch (err) {
      logger.error('Error in redeemSecretKey Firestore transaction:', err);
      return { success: false, code: 'ERROR', message: 'Failed to redeem secret key.' };
    }
  }

  /**
   * Alias for verifyAndRedeemKey
   */
  static async verifyAndRedeemKey(params) {
    return this.redeemSecretKey(params);
  }

  /**
   * Alias / wrapper for getKeyStatus
   */
  static async getKeyStatus(keyString) {
    const res = await this.validateSecretKey(keyString);
    if (!res.isValid) {
      return { success: false, ...res };
    }
    return { success: true, ...res };
  }

  /**
   * Revoke a secret key
   */
  static async revokeKey(secretKey, reason = '') {
    const normalizedKey = this.normalizeKey(secretKey);
    const keyRef = admin.firestore().collection('secret_keys').doc(normalizedKey);
    const doc = await keyRef.get();
    if (!doc.exists) {
      return { success: false, message: 'Secret key not found.' };
    }
    await keyRef.update({
      isActive: false,
      status: 'revoked',
      revocationReason: reason,
      revokedAt: Date.now(),
      updatedAt: Date.now()
    });
    return { success: true, message: `Key ${normalizedKey} revoked successfully.` };
  }
}

module.exports = SecretKeyService;
