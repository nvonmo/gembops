import multer from "multer";
import type { StorageEngine } from "multer";
import { uploadToS3, isS3Configured, S3_BUCKET } from "./s3.js";

/**
 * Multer storage engine for S3 using AWS SDK v3
 */
export const s3Storage: StorageEngine = {
  _handleFile: async (req, file, cb) => {
    try {
      if (!isS3Configured()) {
        return cb(new Error("S3 is not configured"));
      }

      const chunks: Buffer[] = [];
      
      file.stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      file.stream.on("end", async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const ext = file.originalname.split(".").pop() || "";
          const filename = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          
          const url = await uploadToS3(filename, buffer, file.mimetype);
          
          cb(null, {
            fieldname: file.fieldname,
            originalname: file.originalname,
            encoding: file.encoding,
            mimetype: file.mimetype,
            size: buffer.length,
            bucket: S3_BUCKET,
            key: filename,
            location: url,
            filename: filename.split("/").pop() || filename,
          });
        } catch (error: any) {
          cb(error);
        }
      });

      file.stream.on("error", (error) => {
        cb(error);
      });
    } catch (error: any) {
      cb(error);
    }
  },

  _removeFile: (_req, file, cb) => {
    // S3 files are not removed automatically
    // If needed, implement deletion logic here
    cb(null);
  },
};
