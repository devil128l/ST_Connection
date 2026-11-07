/**
 * Cloudflare R2 Storage Service (S3-Compatible)
 * Handles uploading images, videos, audio notes, and attachments to Cloudflare R2.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string; // e.g. https://media.stconnection.bond or https://pub-xxx.r2.dev
}

class R2StorageService {
  private client: S3Client | null = null;
  private config: R2Config | null = null;

  constructor() {
    this.initFromEnv();
  }

  public initFromEnv() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME || 'stconnection-media';
    const publicUrl = process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_DOMAIN;

    if (accountId && accessKeyId && secretAccessKey) {
      this.config = {
        accountId,
        accessKeyId,
        secretAccessKey,
        bucketName,
        publicUrl: publicUrl?.replace(/\/$/, ''),
      };

      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      console.log(`[Cloudflare R2] Connected to bucket '${bucketName}' on account ${accountId.slice(0, 6)}...`);
    } else {
      this.client = null;
      this.config = null;
    }
  }

  public isConfigured(): boolean {
    return this.client !== null && this.config !== null;
  }

  public getConfigInfo() {
    return {
      configured: this.isConfigured(),
      bucketName: this.config?.bucketName || 'Not configured',
      publicUrl: this.config?.publicUrl || 'Direct storage or Base64 fallback',
      accountId: this.config ? `${this.config.accountId.slice(0, 6)}...` : undefined,
    };
  }

  /**
   * Uploads a Buffer directly to Cloudflare R2 bucket.
   * If R2 is not configured, returns null (caller will fall back to local/data URL).
   */
  public async uploadFile(
    fileBuffer: Buffer,
    mimeType: string,
    originalName?: string,
    prefix: 'avatars' | 'chat_media' | 'voice_notes' | 'stories' | 'channels' = 'chat_media'
  ): Promise<string | null> {
    if (!this.client || !this.config) {
      return null;
    }

    const ext = originalName ? originalName.split('.').pop() || 'bin' : this.getExtensionFromMime(mimeType);
    const uniqueId = crypto.randomBytes(12).toString('hex');
    const objectKey = `${prefix}/${Date.now()}_${uniqueId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    await this.client.send(command);

    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${objectKey}`;
    }

    // Default R2 endpoint URL or relative media proxy
    return `/api/media/${objectKey}`;
  }

  /**
   * Uploads a base64 Data URL (data:image/png;base64,...) to Cloudflare R2
   */
  public async uploadDataUrl(
    dataUrl: string,
    prefix: 'avatars' | 'chat_media' | 'voice_notes' | 'stories' | 'channels' = 'chat_media'
  ): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return null;
    }

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    return this.uploadFile(buffer, mimeType, undefined, prefix);
  }

  /**
   * Generates a pre-signed URL for direct browser-to-R2 upload
   */
  public async getPresignedUploadUrl(
    filename: string,
    mimeType: string,
    prefix: string = 'uploads'
  ): Promise<{ uploadUrl: string; fileKey: string; publicUrl: string } | null> {
    if (!this.client || !this.config) return null;

    const ext = filename.split('.').pop() || 'bin';
    const uniqueId = crypto.randomBytes(12).toString('hex');
    const fileKey = `${prefix}/${Date.now()}_${uniqueId}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: fileKey,
      ContentType: mimeType,
    });

    // 15-minute presigned upload URL
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 900 });
    const publicUrl = this.config.publicUrl
      ? `${this.config.publicUrl}/${fileKey}`
      : `/api/media/${fileKey}`;

    return { uploadUrl, fileKey, publicUrl };
  }

  private getExtensionFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'application/pdf': 'pdf',
    };
    return map[mime] || 'bin';
  }
}

export const r2 = new R2StorageService();
