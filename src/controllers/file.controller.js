const storage = require('../storage/storage.service');

/**
 * GET /api/v1/files?path={filePath}
 * Streams a file from local disk or Cloudflare R2 bucket with proper Content-Type
 */
const getFile = async (req, res, next) => {
  try {
    const filePath = req.query.path || req.query.filePath || req.query.url;
    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'Parameter query path (atau filePath) wajib diisi',
      });
    }

    const { stream, mimeType } = await storage.getFileStream(filePath);

    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Handle stream errors
    stream.on('error', (err) => {
      console.error('[FileController] Stream error:', err);
      if (!res.headersSent) {
        res.status(404).json({ success: false, message: 'File tidak dapat dibaca' });
      }
    });

    stream.pipe(res);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

module.exports = { getFile };
