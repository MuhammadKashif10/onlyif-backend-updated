const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary storage for multer. This replaces the previous
// diskStorage implementation so files are no longer written to /uploads.
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Default folder in Cloudinary; we keep subfolders per field to
    // mirror the old filesystem layout while keeping API responses the same.
    let folder = 'real-estate';

    if (file.fieldname === 'images') {
      folder = 'real-estate/properties/images';
    } else if (file.fieldname === 'floorPlans') {
      folder = 'real-estate/properties/floorplans';
    } else if (file.fieldname === 'videos') {
      folder = 'real-estate/properties/videos';
    } else if (file.fieldname === 'profileImage') {
      folder = 'real-estate/agents';
    }

    const isVideo = file.fieldname === 'videos';

    const params = {
      folder,
      resource_type: isVideo ? 'video' : 'image'
    };

    // Restrict standard image uploads to jpg/jpeg/png as requested.
    if (!isVideo && (file.fieldname === 'images' || file.fieldname === 'profileImage')) {
      params.allowed_formats = ['jpg', 'jpeg', 'png'];
    }

    return params;
  }
});

// Enhanced file filter with detailed error messages (unchanged logic)
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
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file (increased for videos)
    files: 20, // Maximum 20 files total
    fieldSize: 10 * 1024 * 1024 // 10MB for form fields
  },
  onError: function (err, next) {
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

module.exports = { uploadFields, uploadProfileImage };
