/**
 * Ambient declarations for third-party modules that ship no types and
 * have no @types package. Declaring them (untyped) satisfies NodeNext
 * resolution under strict mode; the imported values are `any`, which
 * matches how these libraries were used from the pre-migration JS.
 */
declare module 'xml2js';
declare module 'rtf2text';
declare module 'jsdom';
declare module 'multer';
declare module 'pdf-parse';
declare module 'cors';
declare module 'cookie-parser';
