import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vercel Functions possuem sistema de arquivos somente leitura; apenas /tmp
// pode ser usado durante a execução. Importações são processadas na mesma
// requisição e o conteúdo validado fica persistido no PostgreSQL.
export const uploadRoot = process.env.VERCEL
  ? path.join('/tmp', 'cpe-uploads')
  : path.resolve(__dirname, '../../', env.uploadDir);
export const documentsDir = path.join(uploadRoot, 'documents');
export const importsDir = path.join(uploadRoot, 'imports');

for (const dir of [documentsDir, importsDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // arquivos de importação / documentos — separados por tipo de rota
    const toImports = req.routeType === 'import';
    cb(null, toImports ? importsDir : documentsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

export const UPLOAD_SUFFIXES = ['.csv', '.xlsx', '.xls'];

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (req.routeType === 'import') {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!UPLOAD_SUFFIXES.includes(ext)) {
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file');
        error.message = `Formato não suportado (${ext || 'sem extensão'}). Use CSV ou XLSX.`;
        return cb(error);
      }
    }
    cb(null, true);
  },
});

export const uploadImportFile = (req, res, next) => {
  req.routeType = 'import';
  upload.single('file')(req, res, next);
};

export const uploadDocumentFile = (req, res, next) => {
  req.routeType = 'document';
  upload.single('file')(req, res, next);
};
