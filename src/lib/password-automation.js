import { randomBytes } from 'node:crypto';
import { changePassword } from '../roblox.js';
import { getAutoPasswordConfig } from './settings.js';
import { setUpdatedAccount } from './account-credentials.js';
import { recordPasswordChange } from './account-history.js';
import {
  failPasswordProcessing,
  finishPasswordProcessing,
  sendPasswordProcessing,
} from './password-delivery.js';

const PASSWORD_PREFIX = 'KazuShop';
const PASSWORD_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_DIGITS = '23456789';

export function createRandomPassword() {
  // Keep the requested mobile-friendly format, for example: KazuShop8H3G.
  const bytes = randomBytes(4);
  const suffix = [
    PASSWORD_DIGITS[bytes[0] % PASSWORD_DIGITS.length],
    PASSWORD_LETTERS[bytes[1] % PASSWORD_LETTERS.length],
    PASSWORD_DIGITS[bytes[2] % PASSWORD_DIGITS.length],
    PASSWORD_LETTERS[bytes[3] % PASSWORD_LETTERS.length],
  ].join('');
  return `${PASSWORD_PREFIX}${suffix}`;
}

function normalizeType(type) {
  return String(type ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isAutoPasswordEnabledForType(guildId, type) {
  const config = getAutoPasswordConfig(guildId);
  const normalizedType = normalizeType(type);
  return Boolean(
    config.enabled &&
    (!config.types?.length || config.types.some((item) => normalizeType(item) === normalizedType)),
  );
}

export function getAutoPasswordStatus(guildId) {
  const config = getAutoPasswordConfig(guildId);
  return {
    ...config,
    types: config.types?.length ? [...config.types] : [],
    scope: config.types?.length ? config.types.join(', ') : 'all account types',
  };
}

export async function applyAutomaticPasswordChange({ client, guildId, type, account, ownerId }) {
  if (!isAutoPasswordEnabledForType(guildId, type)) {
    return { account, changed: false, error: null };
  }

  if (!account?.cookie || !account?.password) {
    return {
      account,
      changed: false,
      error: 'The generated account did not include both a password and a session cookie.',
    };
  }

  const newPassword = createRandomPassword();
  const processingMessage = await sendPasswordProcessing(client, {
    guildId,
    username: account.username,
  });
  try {
    await changePassword({
      cookie: account.cookie,
      currentPassword: account.password,
      newPassword,
    });
    const updatedAccount = {
      ...account,
      password: newPassword,
      passwordChangeStatus: 'Automatically changed',
    };
    let storageErrorMessage = null;
    try {
      setUpdatedAccount(updatedAccount);
    } catch (storageError) {
      storageErrorMessage = storageError.message;
      updatedAccount.passwordChangeStatus =
        `Automatically changed; secure history sync failed: ${storageError.message}`;
    }
    try {
      recordPasswordChange(updatedAccount);
    } catch (storageError) {
      console.error('Could not save automatic password history:', storageError.message);
    }
    await finishPasswordProcessing(processingMessage, updatedAccount, {
      guildId,
      ownerId,
    });
    return { account: updatedAccount, changed: true, error: storageErrorMessage };
  } catch (error) {
    await failPasswordProcessing(processingMessage, account?.username, error.message, guildId);
    return {
      account: {
        ...account,
        passwordChangeStatus: `Automatic change failed: ${error.message}`,
      },
      changed: false,
      error: error.message,
    };
  }
}