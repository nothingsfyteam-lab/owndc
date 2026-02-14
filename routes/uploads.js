const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Simple file upload endpoint (without multer for now - using base64)
router.post('/', requireAuth, express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { filename, data, fileType, messageId } = req.body;
    
    if (!data || !filename) {
      return res.status(400).json({ error: 'File data and filename required' });
    }

    // Decode base64
    const buffer = Buffer.from(data.split(',')[1] || data, 'base64');
    
    // Generate unique filename
    const uniqueName = `${Date.now()}-${filename}`;
    const filePath = path.join(uploadsDir, uniqueName);
    
    // Save file
    fs.writeFileSync(filePath, buffer);
    
    // Get file info
    const stats = fs.statSync(filePath);
    
    // Determine file type category
    let type = 'file';
    if (fileType.startsWith('image/')) type = 'image';
    else if (fileType.startsWith('video/')) type = 'video';
    else if (fileType.startsWith('audio/')) type = 'audio';
    
    // Save to database
    const { v4: uuidv4 } = require('uuid');
    const db = getDb();
    
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO attachments (id, message_id, filename, file_size, file_type, url) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), messageId, filename, stats.size, type, `/uploads/${uniqueName}`],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    res.json({
      url: `/uploads/${uniqueName}`,
      filename,
      size: stats.size,
      type
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get upload by ID
router.get('/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;
