import { serve } from 'bun';
import { connectToDatabase } from './database/mongo';
import { PatientController } from './controllers/PatientController';

// Connect to database
await connectToDatabase();

// HTTP Server
const server = serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    // Serve simple patient form
    if (req.method === 'GET' && url.pathname === '/patient-form') {
      const html = await Bun.file('public/patient-form.html').text();
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Create patient
    if (req.method === 'POST' && url.pathname === '/patients') {
      const ctx = { request: req, params: {}, headers: new Headers(), status: 200 } as any;
      return await PatientController.createPatient(ctx);
    }
    
    // Routing untuk file operations
    if (req.method === 'POST' && url.pathname.match(/^\/patients\/[^/]+\/episodes\/[^/]+\/stages\/[^/]+\/files$/)) {
      const match = url.pathname.match(/^\/patients\/([^/]+)\/episodes\/([^/]+)\/stages\/([^/]+)\/files$/);
      if (match) {
        const [, patientId, episodeId, stageId] = match;
        const ctx = { 
          request: req, 
          params: { patientId, episodeId, stageId },
          headers: new Headers(),
          status: 200
        } as any;
        
        const result = await PatientController.uploadFile(ctx);
        return new Response(JSON.stringify(result), {
          status: ctx.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Download file
    if (req.method === 'GET' && url.pathname.match(/^\/patients\/[^/]+\/episodes\/[^/]+\/stages\/[^/]+\/files\/[^/]+\/download$/)) {
      const match = url.pathname.match(/^\/patients\/([^/]+)\/episodes\/([^/]+)\/stages\/([^/]+)\/files\/([^/]+)\/download$/);
      if (match) {
        const [, patientId, episodeId, stageId, fileId] = match;
        const ctx = { 
          request: req, 
          params: { patientId, episodeId, stageId, fileId },
          headers: new Headers(),
          status: 200
        } as any;
        
        return await PatientController.downloadFile(ctx);
      }
    }
    
    // View file inline
    if (req.method === 'GET' && url.pathname.match(/^\/patients\/[^/]+\/episodes\/[^/]+\/stages\/[^/]+\/files\/[^/]+$/)) {
      const match = url.pathname.match(/^\/patients\/([^/]+)\/episodes\/([^/]+)\/stages\/([^/]+)\/files\/([^/]+)$/);
      if (match) {
        const [, patientId, episodeId, stageId, fileId] = match;
        const ctx = { 
          request: req, 
          params: { patientId, episodeId, stageId, fileId },
          headers: new Headers(),
          status: 200
        } as any;
        
        return await PatientController.viewFile(ctx);
      }
    }
    
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);