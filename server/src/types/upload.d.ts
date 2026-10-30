import 'express-serve-static-core';
import type { UploadedFile } from 'multer';

declare module 'express-serve-static-core' {
  interface Request {
    file?: UploadedFile;
  }
}
