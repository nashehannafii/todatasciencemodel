import { ObjectId, Binary, GridFSBucket } from 'mongodb';
import { getGridFSBucket } from '../database/mongo';
import { Readable } from 'stream';

export interface UploadFileOptions {
  filename: string;
  contentType: string;
  metadata?: Record<string, any>;
}

// Custom Readable stream for chunked base64 decoding
class Base64ChunkStream extends Readable {
  private base64Data: string;
  private position: number;
  private chunkSize: number;

  constructor(base64Data: string, chunkSize: number = 1024 * 1024) { // 1MB chunks
    super();
    this.base64Data = base64Data;
    this.position = 0;
    this.chunkSize = chunkSize;
  }

  _read() {
    if (this.position >= this.base64Data.length) {
      this.push(null); // EOF
      return;
    }

    // Calculate chunk size in base64 (must be multiple of 4)
    const base64ChunkSize = Math.floor(this.chunkSize * 4 / 3);
    const alignedChunkSize = Math.floor(base64ChunkSize / 4) * 4;
    
    const chunk = this.base64Data.slice(this.position, this.position + alignedChunkSize);
    this.position += alignedChunkSize;

    try {
      const buffer = Buffer.from(chunk, 'base64');
      this.push(buffer);
    } catch (error) {
      this.destroy(error as Error);
    }
  }
}

export class FileService {
  private gridFSBucket?: GridFSBucket;

  constructor() {}

  private bucket(): GridFSBucket {
    // Lazily initialize after DB connection is ready
    if (!this.gridFSBucket) {
      this.gridFSBucket = getGridFSBucket();
    }
    return this.gridFSBucket;
  }

  // Method 1: Upload file ke GridFS (untuk file besar > 16MB)
  async uploadFileToGridFS(
    buffer: Buffer | Readable,
    options: UploadFileOptions
  ): Promise<ObjectId> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.bucket().openUploadStream(
        options.filename,
        {
          contentType: options.contentType,
          metadata: options.metadata || {}
        }
      );

      if (buffer instanceof Buffer) {
        uploadStream.write(buffer);
        uploadStream.end();
      } else if (buffer instanceof Readable) {
        buffer.pipe(uploadStream);
      } else {
        reject(new Error('Invalid buffer type'));
        return;
      }

      uploadStream.on('finish', () => {
        resolve(uploadStream.id);
      });

      uploadStream.on('error', reject);
    });
  }

  // Method 2: Download file dari GridFS
  async downloadFileFromGridFS(fileId: ObjectId): Promise<Buffer> {
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      const downloadStream = this.bucket().openDownloadStream(fileId);
      
      downloadStream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      downloadStream.on('error', reject);
      
      downloadStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  // Method 3: Get file info dari GridFS
  async getFileInfo(fileId: ObjectId): Promise<any> {
    const files = await this.bucket().find({ _id: fileId }).toArray();
    return files[0] || null;
  }

  // Method 4: Delete file dari GridFS
  async deleteFileFromGridFS(fileId: ObjectId): Promise<boolean> {
    try {
      await this.bucket().delete(fileId);
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  // Method 5: Upload file langsung sebagai Binary (untuk file kecil < 16MB)
  async createBinaryData(
    buffer: Buffer,
    contentType: string,
    filename: string,
    base64String?: string
  ): Promise<any> {
    return {
      data: new Binary(buffer),
      contentType,
      fileName: filename,
      size: buffer.length,
      uploadDate: new Date(),
      // base64: base64String || undefined
    };
  }

  // Method 5b: Upload file dari base64 dengan chunking untuk file besar
  async uploadFromBase64(
    base64Data: string,
    options: UploadFileOptions
  ): Promise<ObjectId> {
    const stream = new Base64ChunkStream(base64Data);
    return this.uploadFileToGridFS(stream, options);
  }

  // Method 5c: Convert base64 to buffer dengan chunking
  async base64ToBuffer(base64Data: string, maxSize: number = 16 * 1024 * 1024): Promise<Buffer> {
    // Estimate decoded size (base64 is ~4/3 of original)
    const estimatedSize = (base64Data.length * 3) / 4;
    
    if (estimatedSize > maxSize) {
      throw new Error(`File too large. Estimated size: ${Math.round(estimatedSize / 1024 / 1024)}MB, max: ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // For smaller files, decode directly
    if (estimatedSize < 5 * 1024 * 1024) { // < 5MB
      return Buffer.from(base64Data, 'base64');
    }

    // For larger files, decode in chunks
    const chunks: Buffer[] = [];
    const chunkSize = 1024 * 1024 * 4; // Process 4MB of base64 at a time (must be multiple of 4)
    const alignedChunkSize = Math.floor(chunkSize / 4) * 4;

    for (let i = 0; i < base64Data.length; i += alignedChunkSize) {
      const chunk = base64Data.slice(i, i + alignedChunkSize);
      const buffer = Buffer.from(chunk, 'base64');
      chunks.push(buffer);
    }

    return Buffer.concat(chunks);
  }

  // Method 6: Convert Binary ke Buffer
  binaryToBuffer(binary: Binary): Buffer {
    return Buffer.from(binary.buffer);
  }

  // Method 7: Get file stream untuk langsung di serve ke client
  getFileStream(fileId: ObjectId): Readable {
    return this.bucket().openDownloadStream(fileId);
  }

  // Method 8: List semua files untuk patient tertentu
  async listPatientFiles(patientId: string): Promise<any[]> {
    return await this.bucket()
      .find({ 'metadata.patientId': patientId })
      .toArray();
  }
}