const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist with proper error handling
const uploadsDir = path.join(__dirname, '../uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory:', uploadsDir);
  }
  
  // Test write permissions
  const testFile = path.join(uploadsDir, 'test-write-permission.tmp');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  console.log('✅ Upload directory has write permissions');
} catch (error) {
  console.error('❌ Upload directory setup failed:', error.message);
  throw new Error(`Upload directory setup failed: ${error.message}`);
}

// Configure multer storage with enhanced error handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      let uploadPath = uploadsDir;
      
      // Create subdirectories based on file type
      if (file.fieldname === 'images') {
        uploadPath = path.join(uploadsDir, 'images');
      } else if (file.fieldname === 'floorPlans') {
        uploadPath = path.join(uploadsDir, 'floorplans');
      } else if (file.fieldname === 'videos') {
        uploadPath = path.join(uploadsDir, 'videos');
      } else if (file.fieldname === 'profileImage') {
        uploadPath = path.join(uploadsDir, 'agents');
      }
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
        console.log(`✅ Created directory: ${uploadPath}`);
      }
      
      cb(null, uploadPath);
    } catch (error) {
      console.error('❌ Directory creation failed:', error);
      cb(new Error(`Failed to create upload directory: ${error.message}`), null);
    }
  },
  filename: function (req, file, cb) {
    try {
      // Generate unique filename with timestamp and random suffix
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      const filename = file.fieldname + '-' + uniqueSuffix + extension;
      cb(null, filename);
    } catch (error) {
      console.error('❌ Filename generation failed:', error);
      cb(new Error(`Failed to generate filename: ${error.message}`), null);
    }
  }
});

// Enhanced file filter with detailed error messages
const fileFilter = (req, file, cb) => {
  try {
    if (file.fieldname === 'images' || file.fieldname === 'profileImage') {
      // Accept only image files
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type for ${file.fieldname}: ${file.mimetype}. Only image files are allowed.`), false);
      }
    } else if (file.fieldname === 'floorPlans') {
      // Accept images and PDFs for floor plans
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type for floor plans: ${file.mimetype}. Only image and PDF files are allowed.`), false);
      }
    } else if (file.fieldname === 'videos') {
      // Accept only video files
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type for videos: ${file.mimetype}. Only video files are allowed.`), false);
      }
    } else {
      cb(new Error(`Unknown file field: ${file.fieldname}`), false);
    }
  } catch (error) {
    console.error('❌ File filter error:', error);
    cb(new Error(`File validation failed: ${error.message}`), false);
  }
};

// Configure multer with enhanced limits and error handling
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file (increased for videos)
    files: 20, // Maximum 20 files total
    fieldSize: 10 * 1024 * 1024 // 10MB for form fields
  },
  onError: function(err, next) {
    console.error('❌ Multer error:', err);
    next(err);
  }
});

// Enhanced upload fields middleware with error handling
const uploadFields = (req, res, next) => {
  const uploadHandler = upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'floorPlans', maxCount: 5 },
    { name: 'videos', maxCount: 3 }
  ]);
  
  uploadHandler(req, res, (err) => {
    if (err) {
      console.error('❌ File upload error:', err.message);
      
      // Handle specific multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File too large',
          message: 'File size exceeds 50MB limit. Please compress your files and try again.'
        });
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          error: 'Too many files',
          message: 'Maximum 20 files allowed. Please reduce the number of files and try again.'
        });
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          error: 'Unexpected file field',
          message: 'Invalid file field. Only images, floorPlans, and videos are allowed.'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'File upload failed',
          message: err.message || 'An error occurred during file upload.'
        });
      }
    }
    next();
  });
};

// Single upload middleware for profile image (agents)
const uploadProfileImage = (req, res, next) => {
  const singleHandler = upload.single('profileImage');
  singleHandler(req, res, (err) => {
    if (err) {
      console.error('❌ Profile image upload error:', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File too large', message: 'Image size exceeds 50MB limit.' });
      }
      return res.status(400).json({ success: false, error: 'File upload failed', message: err.message || 'An error occurred during image upload.' });
    }
    next();
  });
};

module.exports = { uploadFields, uploadsDir, uploadProfileImage };
