import { ObjectId, Binary } from 'mongodb';

// Interface untuk File Binary
export interface IFileBinary {
  data: Binary;
  contentType: string;
  fileName: string;
  size: number;
  uploadDate: Date;
}

// Interface untuk File (support both reference and binary)
export interface IFile {
  fileId: string;
  // Optional untuk file yang hanya berupa referensi
  fileType?: string;
  fileSize?: string;
  
  // Binary data langsung (opsional, bisa pilih salah satu)
  binaryData?: IFileBinary;
  
  // Atau jika ingin menyimpan di collection terpisah
  fileRef?: {
    collection: string;
    fileId: ObjectId;
  };
  
  metadata?: {
    uploadedBy?: string;
    uploadDate?: Date;
    description?: string;
    tags?: string[];
  };
}

// Interface untuk Stage
export interface IStage {
  id?: string;
  name: string;
  date: string;
  time: string;
  ward: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  files: IFile[];
  notes?: string;
}

// Interface untuk Episode
export interface IEpisode {
  episodeId: string;
  date: string;
  diagnosis: string;
  doctor: string;
  stages: IStage[];
  createdAt: Date;
  updatedAt: Date;
}

// Interface utama untuk Patient
export interface IPatient {
  _id: ObjectId;
  name: string;
  patientId: string;
  birthDate: string;
  gender: 'male' | 'female' | 'other';
  phone: string;
  email?: string;
  address?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  episodes: IEpisode[];
  createdAt: Date;
  updatedAt: Date;
}

// Schema untuk validation
export const PatientSchema = {
  bsonType: "object",
  required: ["name", "patientId", "birthDate", "gender", "phone"],
  properties: {
    name: { bsonType: "string", description: "must be a string and is required" },
    patientId: { bsonType: "string", description: "must be a string and is required" },
    birthDate: { bsonType: "string", description: "must be a string and is required" },
    gender: { enum: ["male", "female", "other"], description: "must be one of the enum values" },
    phone: { bsonType: "string", description: "must be a string and is required" },
    episodes: {
      bsonType: "array",
      items: {
        bsonType: "object",
        required: ["episodeId", "date", "diagnosis", "doctor", "createdAt"],
        properties: {
          episodeId: { bsonType: "string" },
          date: { bsonType: "string" },
          diagnosis: { bsonType: "string" },
          doctor: { bsonType: "string" },
          stages: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["name", "date", "time", "ward", "status"],
              properties: {
                name: { bsonType: "string" },
                date: { bsonType: "string" },
                time: { bsonType: "string" },
                ward: { bsonType: "string" },
                status: { enum: ["pending", "in-progress", "completed", "cancelled"] },
                files: {
                  bsonType: "array",
                  items: {
                    bsonType: "object",
                    required: ["fileId"],
                    properties: {
                      fileId: { bsonType: "string" },
                      binaryData: {
                        bsonType: "object",
                        properties: {
                          data: { bsonType: "binData" },
                          contentType: { bsonType: "string" },
                          fileName: { bsonType: "string" },
                          size: { bsonType: "number" },
                          uploadDate: { bsonType: "date" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};