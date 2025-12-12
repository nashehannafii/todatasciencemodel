import { MongoClient, Db, Collection, GridFSBucket } from 'mongodb';
import { IPatient } from '../models/Patient';

// Prefer environment variables; fallback to local dev instance
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'patient';

let client: MongoClient;
let db: Db;
let patientsCollection: Collection<IPatient>;
let gridFSBucket: GridFSBucket;

export async function connectToDatabase() {
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    
    // Ensure collection exists with validator; create if missing
    const existingCollections = await db.listCollections({ name: 'patients' }).toArray();
    if (existingCollections.length === 0) {
      await db.createCollection('patients', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'patientId', 'birthDate', 'gender', 'phone'],
            properties: {
              patientId: { bsonType: 'string', description: 'required' },
              phone: { bsonType: 'string', description: 'required' }
            }
          }
        }
      });
    }
    patientsCollection = db.collection<IPatient>('patients');
    
    // GridFS untuk file besar
    gridFSBucket = new GridFSBucket(db, {
      bucketName: 'patient_files',
      chunkSizeBytes: 255 * 1024, // 255KB per chunk
    });
    
    console.log('Connected to MongoDB successfully');
    
    // Create indexes
    await patientsCollection.createIndex({ patientId: 1 }, { unique: true });
    await patientsCollection.createIndex({ name: 'text' });
    await patientsCollection.createIndex({ 'episodes.episodeId': 1 });
    
    // Try to strengthen validator; ignore if collMod fails (e.g., permissions)
    try {
      await db.command({
        collMod: 'patients',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'patientId', 'birthDate', 'gender', 'phone'],
            properties: {
              patientId: { bsonType: 'string', pattern: '^[A-Za-z0-9-]+$' },
              phone: { bsonType: 'string', pattern: '^[0-9]{7,15}$' }
            }
          }
        }
      });
    } catch (e) {
      console.warn('collMod validator update skipped:', (e as any)?.message);
    }
    
    return { db, patientsCollection, gridFSBucket };
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

// Get GridFS bucket untuk upload/download file
export function getGridFSBucket(): GridFSBucket {
  if (!gridFSBucket) {
    throw new Error('Database not connected. Call connectToDatabase first.');
  }
  return gridFSBucket;
}

export function getPatientsCollection(): Collection<IPatient> {
  if (!patientsCollection) {
    throw new Error('Database not connected. Call connectToDatabase first.');
  }
  return patientsCollection;
}

export async function closeDatabaseConnection() {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
}