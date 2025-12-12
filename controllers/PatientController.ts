import { Context } from 'bun';
import { PatientService } from '../services/PatientService';
import { FileService } from '../services/FileService';

const patientService = new PatientService();
const fileService = new FileService();

export class PatientController {
  // List patients
  static async listPatients(ctx: Context) {
    try {
      const url = new URL(ctx.request.url);
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam))) : 50;
      const patients = await patientService.listPatients(limit);
      return new Response(JSON.stringify({ patients }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Get patient detail
  static async getPatient(ctx: Context) {
    try {
      const { patientId } = (ctx.params as any) || {};
      if (!patientId) {
        return new Response(JSON.stringify({ error: 'patientId required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const patient = await patientService.getPatientById(patientId);
      if (!patient) {
        return new Response(JSON.stringify({ error: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ patient }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  // Create patient endpoint
  static async createPatient(ctx: Context) {
    try {
      const contentType = ctx.request.headers.get('content-type') || '';
      let payload: any;
      if (contentType.includes('application/json')) {
        payload = await ctx.request.json();
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await ctx.request.formData();
        payload = Object.fromEntries(Array.from(formData.entries()));
      } else {
        const text = await ctx.request.text();
        payload = text ? JSON.parse(text) : {};
      }

      // Basic shape normalization from form fields
      const patientData = {
        name: payload.name,
        patientId: payload.patientId,
        birthDate: payload.birthDate,
        gender: payload.gender,
        phone: payload.phone,
        email: payload.email || undefined,
        address: payload.address || undefined,
        emergencyContact: payload.emergencyContactName ? {
          name: payload.emergencyContactName,
          phone: payload.emergencyContactPhone,
          relationship: payload.emergencyContactRelationship
        } : undefined,
        episodes: []
      } as any;

      const created = await patientService.createPatient(patientData);
      return new Response(JSON.stringify({ success: true, patient: created }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  // Upload file endpoint
  static async uploadFile(ctx: Context) {
    try {
      const formData = await ctx.request.formData();
      const patientId = ctx.params.patientId;
      const episodeId = ctx.params.episodeId;
      const stageId = ctx.params.stageId;
      
      const file = formData.get('file') as File;
      const fileId = formData.get('fileId') as string;
      const description = formData.get('description') as string;

      if (!file || !fileId) {
        ctx.status = 400;
        return { error: 'File and fileId are required' };
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      
      const result = await patientService.addFileWithBinary(
        patientId,
        episodeId,
        stageId,
        {
          buffer,
          filename: file.name,
          contentType: file.type,
          fileId,
          metadata: {
            description,
            originalName: file.name,
            size: file.size
          }
        }
      );

      if (!result) {
        ctx.status = 404;
        return { error: 'Patient, episode, or stage not found' };
      }

      return { 
        success: true, 
        message: 'File uploaded successfully',
        fileId 
      };
    } catch (error: any) {
      ctx.status = 500;
      return { error: error.message };
    }
  }

  // Download file endpoint
  static async downloadFile(ctx: Context) {
    try {
      const { patientId, episodeId, stageId, fileId } = ctx.params;
      
      const fileData = await patientService.getFile(
        patientId,
        episodeId,
        stageId,
        fileId
      );

      if (!fileData) {
        ctx.status = 404;
        return { error: 'File not found' };
      }

      // Set appropriate headers
      ctx.headers.set('Content-Type', fileData.contentType);
      ctx.headers.set('Content-Disposition', `attachment; filename="${fileData.filename}"`);
      
      return new Response(fileData.buffer);
    } catch (error: any) {
      ctx.status = 500;
      return { error: error.message };
    }
  }

  // View file inline (untuk PDF/Images)
  static async viewFile(ctx: Context) {
    try {
      const { patientId, episodeId, stageId, fileId } = ctx.params;
      
      const fileData = await patientService.getFile(
        patientId,
        episodeId,
        stageId,
        fileId
      );

      if (!fileData) {
        ctx.status = 404;
        return { error: 'File not found' };
      }

      // Set headers untuk view inline
      ctx.headers.set('Content-Type', fileData.contentType);
      ctx.headers.set('Content-Disposition', `inline; filename="${fileData.filename}"`);
      
      return new Response(fileData.buffer);
    } catch (error: any) {
      ctx.status = 500;
      return { error: error.message };
    }
  }

  // Get file info
  static async getFileInfo(ctx: Context) {
    try {
      const { patientId, episodeId, stageId, fileId } = ctx.params;
      
      const collection = getPatientsCollection();
      const patient = await collection.findOne({
        patientId,
        'episodes.episodeId': episodeId,
        'episodes.stages.id': stageId,
        'episodes.stages.files.fileId': fileId
      });

      if (!patient) {
        ctx.status = 404;
        return { error: 'File not found' };
      }

      const episode = patient.episodes.find(e => e.episodeId === episodeId);
      const stage = episode?.stages.find(s => s.id === stageId);
      const file = stage?.files.find(f => f.fileId === fileId);

      return {
        fileId: file?.fileId,
        metadata: file?.metadata,
        binaryData: file?.binaryData ? {
          contentType: file.binaryData.contentType,
          fileName: file.binaryData.fileName,
          size: file.binaryData.size,
          uploadDate: file.binaryData.uploadDate
        } : null,
        fileRef: file?.fileRef
      };
    } catch (error: any) {
      ctx.status = 500;
      return { error: error.message };
    }
  }
}