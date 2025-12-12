import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb+srv://patient_db:LjsgUTBH3i5wAx3b@cluster0.u10ae.mongodb.net';
const DB_NAME = 'patient';

async function resetCollection() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    // Drop collection
    try {
      await db.collection('patients').drop();
      console.log('✓ Collection "patients" dropped');
    } catch (e: any) {
      console.log('ℹ Collection "patients" does not exist');
    }
    
    console.log('✓ Done. Collection will be recreated on next server start');
  } finally {
    await client.close();
  }
}

resetCollection().catch(console.error);
