import crypto from 'crypto';
import { pool } from './connection';
import { RowDataPacket } from 'mysql2';
import { config } from '../core/config';
import fs from 'fs';
import path from 'path';

// AES encryption helpers
const ALGORITHM = 'aes-256-cbc';
export function encryptWithServerSecret(text: string, secret: string): string {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptWithServerSecret(encryptedText: string, secret: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted text format');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function syncMemberChannelKey(canalId: number, targetUsuarioId: number) {
  const serverSecret = config.JWT_SECRET || 'default-secret-key-smo-it-core';

  // Check if target user needs key
  const [targets] = await pool.query<RowDataPacket[]>(
    `SELECT m.canal_id, m.usuario_id, u.public_key 
     FROM chat_canal_miembro m 
     JOIN usuario u ON m.usuario_id = u.id 
     WHERE m.canal_id = ? AND m.usuario_id = ? AND m.encrypted_channel_key IS NULL`,
    [canalId, targetUsuarioId]
  );

  if (targets.length === 0) return;
  const m = targets[0];

  // Find helper who has the channel key
  const [helpers] = await pool.query<RowDataPacket[]>(
    `SELECT m2.usuario_id, m2.encrypted_channel_key, u2.encrypted_private_key 
     FROM chat_canal_miembro m2 
     JOIN usuario u2 ON m2.usuario_id = u2.id 
     WHERE m2.canal_id = ? AND m2.encrypted_channel_key IS NOT NULL LIMIT 1`,
    [canalId]
  );

  if (helpers.length > 0 && m.public_key) {
    try {
      const helper = helpers[0];
      const decryptedHelperPrivString = decryptWithServerSecret(helper.encrypted_private_key, serverSecret);
      const helperPrivKeyObj = crypto.createPrivateKey({
        key: JSON.parse(decryptedHelperPrivString),
        format: 'jwk'
      });

      const encryptedChannelKeyBytes = Buffer.from(helper.encrypted_channel_key, 'base64');
      const channelKeyBytes = crypto.privateDecrypt(
        {
          key: helperPrivKeyObj,
          oaepHash: 'sha256'
        },
        encryptedChannelKeyBytes
      );

      const targetPubKeyObj = crypto.createPublicKey({
        key: JSON.parse(m.public_key),
        format: 'jwk'
      });
      const reEncryptedKeyBytes = crypto.publicEncrypt(
        {
          key: targetPubKeyObj,
          oaepHash: 'sha256'
        },
        channelKeyBytes
      );
      const reEncryptedKeyBase64 = reEncryptedKeyBytes.toString('base64');

      await pool.query(
        'UPDATE chat_canal_miembro SET encrypted_channel_key = ? WHERE canal_id = ? AND usuario_id = ?',
        [reEncryptedKeyBase64, canalId, targetUsuarioId]
      );
      console.log(`Synced channel key for user ${targetUsuarioId} in channel ${canalId}`);
    } catch (err: any) {
      console.error(`Failed to sync key for user ${targetUsuarioId} in channel ${canalId}:`, err.message);
    }
  }
}

export async function generateKeysForUser(userId: number, email: string) {
  const serverSecret = config.JWT_SECRET || 'default-secret-key-smo-it-core';
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  const pubJwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });

  const pubString = JSON.stringify(pubJwk);
  const privString = JSON.stringify(privJwk);

  const encPrivKey = encryptWithServerSecret(privString, serverSecret);

  await pool.query(
    'UPDATE usuario SET public_key = ?, encrypted_private_key = ? WHERE id = ?',
    [pubString, encPrivKey, userId]
  );
  console.log(`Generated E2EE keys for user: ${email} (ID: ${userId})`);

  // Invalidate existing memberships' keys since user keypair changed
  await pool.query(
    'UPDATE chat_canal_miembro SET encrypted_channel_key = NULL WHERE usuario_id = ?',
    [userId]
  );

  // Auto-join this user to all public channels
  const [publicChannels] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM chat_canal WHERE is_private = FALSE'
  );
  for (const canal of publicChannels) {
    const [existingMember] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM chat_canal_miembro WHERE canal_id = ? AND usuario_id = ?',
      [canal.id, userId]
    );
    if (existingMember.length === 0) {
      await pool.query(
        'INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (?, ?)',
        [canal.id, userId]
      );
    }
  }

  // Get all channels this user is a member of and sync keys
  const [memberships] = await pool.query<RowDataPacket[]>(
    'SELECT canal_id FROM chat_canal_miembro WHERE usuario_id = ?',
    [userId]
  );
  for (const m of memberships) {
    await syncMemberChannelKey(m.canal_id, userId);
  }
}

export async function initializeE2EE() {
  const serverSecret = config.JWT_SECRET || 'default-secret-key-smo-it-core';
  
  // One-time wipe to clear legacy unencrypted channels and start fresh
  const markerPath = path.join(__dirname, 'e2ee_wiped.marker');
  if (!fs.existsSync(markerPath)) {
    console.log('Wiping all legacy chats, members and messages to start from scratch...');
    try {
      await pool.query('DELETE FROM chat_mensaje');
      await pool.query('DELETE FROM chat_canal_miembro');
      await pool.query('DELETE FROM chat_canal');
      fs.writeFileSync(markerPath, 'wiped');
      console.log('Legacy chats successfully wiped.');
    } catch (err: any) {
      console.error('Failed to wipe legacy chats:', err.message);
    }
  }

  console.log('Initializing E2EE keys for all users and channels...');

  // 1. Generate keys for users who don't have them or whose keys are not decryptable by server secret
  const [users] = await pool.query<RowDataPacket[]>(
    'SELECT id, email, public_key, encrypted_private_key FROM usuario'
  );

  for (const u of users) {
    let needsKeys = !u.public_key || !u.encrypted_private_key;

    if (!needsKeys) {
      try {
        decryptWithServerSecret(u.encrypted_private_key, serverSecret);
      } catch (err) {
        needsKeys = true;
      }
    }

    if (needsKeys) {
      console.log(`Generating E2EE keys for user: ${u.email}`);
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048
      });
      const pubJwk = publicKey.export({ format: 'jwk' });
      const privJwk = privateKey.export({ format: 'jwk' });

      const pubString = JSON.stringify(pubJwk);
      const privString = JSON.stringify(privJwk);

      const encPrivKey = encryptWithServerSecret(privString, serverSecret);

      await pool.query(
        'UPDATE usuario SET public_key = ?, encrypted_private_key = ? WHERE id = ?',
        [pubString, encPrivKey, u.id]
      );

      // Invalidate existing memberships' keys since user keypair changed
      await pool.query(
        'UPDATE chat_canal_miembro SET encrypted_channel_key = NULL WHERE usuario_id = ?',
        [u.id]
      );
    }
  }

  // 1.7 If no channels exist, seed default ones (general and soportes)
  const [existingChanCount] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) as count FROM chat_canal'
  );
  if (existingChanCount[0].count === 0) {
    console.log('Seeding default channels general and soportes...');
    // Create general (public) channel with creator_id = 1 (admin)
    await pool.query(
      'INSERT INTO chat_canal (id, nombre, is_private, is_dm, creador_id) VALUES (1, "general", FALSE, FALSE, 1)'
    );
    // Create soportes (private) channel with creator_id = 1 (admin)
    await pool.query(
      'INSERT INTO chat_canal (id, nombre, is_private, is_dm, creador_id) VALUES (2, "soportes", TRUE, FALSE, 1)'
    );
    // Add creator as member
    await pool.query(
      'INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (1, 1), (2, 1)'
    );
  }

  // 1.8 Auto-join all users to all public channels if they are missing
  const [publicChannels] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM chat_canal WHERE is_private = FALSE'
  );
  const [allUsers] = await pool.query<RowDataPacket[]>('SELECT id FROM usuario');

  for (const canal of publicChannels) {
    for (const u of allUsers) {
      const [existingMember] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM chat_canal_miembro WHERE canal_id = ? AND usuario_id = ?',
        [canal.id, u.id]
      );
      if (existingMember.length === 0) {
        await pool.query(
          'INSERT INTO chat_canal_miembro (canal_id, usuario_id) VALUES (?, ?)',
          [canal.id, u.id]
        );
      }
    }
  }

  // 2. Fetch all channels
  const [channels] = await pool.query<RowDataPacket[]>('SELECT * FROM chat_canal');

  for (const canal of channels) {
    const [members] = await pool.query<RowDataPacket[]>(
      'SELECT m.*, u.public_key FROM chat_canal_miembro m JOIN usuario u ON m.usuario_id = u.id WHERE m.canal_id = ?',
      [canal.id]
    );

    const hasKeys = members.some(m => m.encrypted_channel_key !== null);
    if (!hasKeys && members.length > 0) {
      console.log(`Initializing E2EE keys for channel: ${canal.nombre}`);
      
      const channelKeyBytes = crypto.randomBytes(32);
      
      for (const member of members) {
        if (!member.public_key) continue;
        try {
          const pubKeyObj = crypto.createPublicKey({
            key: JSON.parse(member.public_key),
            format: 'jwk'
          });
          const encryptedKeyBytes = crypto.publicEncrypt(
            {
              key: pubKeyObj,
              oaepHash: 'sha256'
            },
            channelKeyBytes
          );
          const encryptedKeyBase64 = encryptedKeyBytes.toString('base64');
          
          await pool.query(
            'UPDATE chat_canal_miembro SET encrypted_channel_key = ? WHERE canal_id = ? AND usuario_id = ?',
            [encryptedKeyBase64, canal.id, member.usuario_id]
          );
        } catch (err: any) {
          console.error(`Failed to encrypt channel key for user ${member.usuario_id} in channel ${canal.id}:`, err.message);
        }
      }
    }
  }

  // 3. For any member in chat_canal_miembro who is missing encrypted_channel_key:
  const [missingKeys] = await pool.query<RowDataPacket[]>(
    `SELECT m.canal_id, m.usuario_id, u.public_key 
     FROM chat_canal_miembro m 
     JOIN usuario u ON m.usuario_id = u.id 
     WHERE m.encrypted_channel_key IS NULL`
  );

  for (const m of missingKeys) {
    await syncMemberChannelKey(m.canal_id, m.usuario_id);
  }

  console.log('E2EE initialization completed successfully.');
}
