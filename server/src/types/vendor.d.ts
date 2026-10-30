/**
 * Ambient declarations for third-party modules that ship no types and
 * have no @types package. Declaring them (untyped) satisfies NodeNext
 * resolution under strict mode; the imported values are `any`, which
 * matches how these libraries were used from the pre-migration JS.
 */
declare module 'xml2js';
declare module 'rtf2text';
declare module 'jsdom';
declare module 'multer' {
  import type { Request, Response } from 'express';

  export interface UploadedFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    destination: string;
    filename: string;
    path: string;
    size: number;
  }

  export type StorageCallback = (error: Error | null, destination: string) => void;
  export type FileFilterCallback = (error: Error | null, acceptFile?: boolean) => void;
  export interface DiskStorageOptions {
    destination: string | ((req: Request, file: UploadedFile, callback: StorageCallback) => void);
    filename?: (req: Request, file: UploadedFile, callback: StorageCallback) => void;
  }
  export interface Options {
    storage?: unknown;
    limits?: { fileSize?: number };
    fileFilter?: (req: Request, file: UploadedFile, callback: FileFilterCallback) => void;
  }
  export interface Instance {
    single(fieldName: string): (req: Request, res: Response, callback: (error: (Error & { code?: string }) | null) => void) => void;
  }

  function multer(options?: Options): Instance;
  namespace multer {
    function diskStorage(options: DiskStorageOptions): unknown;
  }
  export default multer;
}
declare module 'word-extractor';
declare module 'pdf-parse';
declare module 'cors';
declare module 'cookie-parser';
