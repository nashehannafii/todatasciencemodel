import { ObjectId, Binary } from 'mongodb';
import { getPatientsCollection } from '../database/mongo';
import { FileService } from './FileService';
import { IPatient, IEpisode, IStage, IFile } from '../models/Patient';

export class PatientService {
  private fileService: FileService;

  constructor() {
    this.fileService = new FileService();
  }

  // Helper: Validate file type
  private validateFileType(contentType: string): boolean {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif'
    ];
    return allowedTypes.includes(contentType);
  }

  // Add file dengan binary langsung
  async addFileWithBinary(
    patientId: string,
    episodeId: string,
    stageId: string,
    fileData: {
      buffer: Buffer;
      filename: string;
      contentType: string;
      fileId: string;
      metadata?: Record<string, any>;
    }
  ): Promise<IPatient | null> {
    // Validasi file type
    if (!this.validateFileType(fileData.contentType)) {
      throw new Error('Invalid file type. Only PDF, JPEG, PNG, GIF allowed.');
    }

    const collection = getPatientsCollection();

    // Upload ke GridFS untuk file besar (> 1MB)
    let fileRef;
    if (fileData.buffer.length > 1 * 1024 * 1024) { // > 1MB
      const gridFSId = await this.fileService.uploadFileToGridFS(
        fileData.buffer,
        {
          filename: fileData.filename,
          contentType: fileData.contentType,
          metadata: {
            patientId,
            episodeId,
            stageId,
            fileId: fileData.fileId,
            ...fileData.metadata
          }
        }
      );

      fileRef = {
        collection: 'patient_files',
        fileId: gridFSId
      };
    } else {
      // Untuk file kecil, simpan langsung sebagai Binary
      const binaryData = await this.fileService.createBinaryData(
        fileData.buffer,
        fileData.contentType,
        fileData.filename
      );

      const newFile: IFile = {
        fileId: fileData.fileId,
        binaryData,
        metadata: {
          uploadedBy: 'system',
          uploadDate: new Date(),
          ...fileData.metadata
        }
      };

      const result = await collection.findOneAndUpdate(
        { 
          patientId,
          'episodes.episodeId': episodeId,
          'episodes.stages.id': stageId
        },
        { $push: { 'episodes.$[ep].stages.$[st].files': newFile } },
        {
          arrayFilters: [
            { 'ep.episodeId': episodeId },
            { 'st.id': stageId }
          ],
          returnDocument: 'after'
        }
      );

      return result;
    }

    // Update patient dengan file reference
    const result = await collection.findOneAndUpdate(
      { 
        patientId,
        'episodes.episodeId': episodeId,
        'episodes.stages.id': stageId
      },
      { 
        $push: { 
          'episodes.$[ep].stages.$[st].files': {
            fileId: fileData.fileId,
            fileRef,
            metadata: {
              uploadedBy: 'system',
              uploadDate: new Date(),
              ...fileData.metadata
            }
          }
        }
      },
      {
        arrayFilters: [
          { 'ep.episodeId': episodeId },
          { 'st.id': stageId }
        ],
        returnDocument: 'after'
      }
    );

    return result;
  }

  // Get file content
  async getFile(
    patientId: string,
    episodeId: string,
    stageId: string,
    fileId: string
  ): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
  } | null> {
    const collection = getPatientsCollection();
    
    const patient = await collection.findOne({
      patientId,
      'episodes.episodeId': episodeId,
      'episodes.stages.id': stageId,
      'episodes.stages.files.fileId': fileId
    });

    if (!patient) return null;

    const episode = patient.episodes.find(e => e.episodeId === episodeId);
    const stage = episode?.stages.find(s => s.id === stageId);
    const file = stage?.files.find(f => f.fileId === fileId);

    if (!file) return null;

    // Jika file tersimpan sebagai binary langsung
    if (file.binaryData) {
      return {
        buffer: this.fileService.binaryToBuffer(file.binaryData.data),
        contentType: file.binaryData.contentType,
        filename: file.binaryData.fileName
      };
    }

    // Jika file tersimpan di GridFS
    if (file.fileRef) {
      const buffer = await this.fileService.downloadFileFromGridFS(
        new ObjectId(file.fileRef.fileId)
      );
      const fileInfo = await this.fileService.getFileInfo(
        new ObjectId(file.fileRef.fileId)
      );

      return {
        buffer,
        contentType: fileInfo.contentType,
        filename: fileInfo.filename
      };
    }

    return null;
  }

  // Delete file
  async deleteFile(
    patientId: string,
    episodeId: string,
    stageId: string,
    fileId: string
  ): Promise<boolean> {
    const collection = getPatientsCollection();
    
    const patient = await collection.findOne({
      patientId,
      'episodes.episodeId': episodeId,
      'episodes.stages.id': stageId,
      'episodes.stages.files.fileId': fileId
    });

    if (!patient) return false;

    const episode = patient.episodes.find(e => e.episodeId === episodeId);
    const stage = episode?.stages.find(s => s.id === stageId);
    const file = stage?.files.find(f => f.fileId === fileId);

    // Hapus dari GridFS jika ada
    if (file?.fileRef) {
      await this.fileService.deleteFileFromGridFS(
        new ObjectId(file.fileRef.fileId)
      );
    }

    // Hapus dari patient document
    const result = await collection.updateOne(
      {
        patientId,
        'episodes.episodeId': episodeId,
        'episodes.stages.id': stageId
      },
      {
        $pull: {
          'episodes.$[ep].stages.$[st].files': { fileId }
        }
      },
      {
        arrayFilters: [
          { 'ep.episodeId': episodeId },
          { 'st.id': stageId }
        ]
      }
    );

    return result.modifiedCount > 0;
  }

  // Get all files for a patient
  async listPatientFiles(patientId: string): Promise<any[]> {
    return await this.fileService.listPatientFiles(patientId);
  }

  // Existing methods tetap sama...
  async createPatient(patientData: Omit<IPatient, '_id' | 'createdAt' | 'updatedAt'>): Promise<IPatient> {
    const collection = getPatientsCollection();
    
    const now = new Date();
    const result = await collection.insertOne({
      _id: new ObjectId(),
      ...patientData,
      episodes: patientData.episodes?.map(ep => ({
        ...ep,
        createdAt: now,
        updatedAt: now,
        stages: ep.stages?.map(st => ({
          ...st,
          id: st.id || new ObjectId().toHexString(),
          files: st.files || []
        })) || []
      })) || [],
      createdAt: now,
      updatedAt: now
    });
    
    return { _id: result.insertedId, ...patientData, createdAt: now, updatedAt: now };
  }

  // ... methods lainnya tetap seperti sebelumnya

  async listPatients(limit = 50): Promise<IPatient[]> {
    const collection = getPatientsCollection();
    const cursor = collection.find({}).sort({ updatedAt: -1 }).limit(limit);
    const docs = await cursor.toArray();
    return docs as unknown as IPatient[];
  }

  async getPatientById(patientId: string): Promise<IPatient | null> {
    const collection = getPatientsCollection();
    const doc = await collection.findOne({ patientId });
    return (doc as unknown as IPatient) || null;
  }
}