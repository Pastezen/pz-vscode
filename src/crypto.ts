/**
 * Crypto utilities for VS Code extension
 * Uses Node.js crypto module for AES-256-GCM encryption/decryption
 */
import * as crypto from 'crypto';

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32; // 256 bits for AES-256

/**
 * Derive a key from passphrase using PBKDF2
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt content using AES-256-GCM
 */
export function encryptContent(content: string, passphrase: string): {
    encrypted: string;
    salt: string;
    iv: string;
} {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(passphrase, salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(content, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Append auth tag to encrypted data
    const authTag = cipher.getAuthTag();
    const encryptedWithTag = Buffer.concat([encrypted, authTag]);

    return {
        encrypted: encryptedWithTag.toString('base64'),
        salt: salt.toString('base64'),
        iv: iv.toString('base64')
    };
}

/**
 * Decrypt content using AES-256-GCM
 */
export function decryptContent(
    encryptedBase64: string,
    passphrase: string,
    saltBase64: string,
    ivBase64: string
): string {
    const encryptedWithTag = Buffer.from(encryptedBase64, 'base64');
    const salt = Buffer.from(saltBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');
    const key = deriveKey(passphrase, salt);

    // Extract auth tag from end (16 bytes)
    const authTag = encryptedWithTag.slice(-16);
    const encrypted = encryptedWithTag.slice(0, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
}

/**
 * Hash passphrase using SHA-256 (for display/verification purposes only)
 * Note: Backend uses bcrypt for actual password verification
 */
export function hashPassphrase(passphrase: string): string {
    return crypto.createHash('sha256').update(passphrase).digest('hex');
}
