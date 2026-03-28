// Updated to match frontend expectations exactly

// Utility function to convert _id to id in response data
const convertIdFields = (obj) => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertIdFields(item));
  }

  // Handle objects
  if (typeof obj === 'object') {
    // Handle Mongoose documents
    if (obj.toObject && typeof obj.toObject === 'function') {
      obj = obj.toObject();
    }

    const converted = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (key === '_id') {
        // Convert _id to id
        converted.id = value.toString();
      } else {
        // Recursively convert nested objects
        converted[key] = convertIdFields(value);
      }
    }
    
    return converted;
  }

  return obj;
};

const successResponse = (data = null, message = 'Success', statusCode = 200, meta = null) => {
  const response = {
    success: true,
    data: convertIdFields(data), // Apply _id to id conversion
    message,
    error: null // Explicitly set error to null for success responses
  };

  if (meta) {
    response.meta = convertIdFields(meta); // Also convert meta if it contains objects with _id
  }

  return response;
};

const errorResponse = (message = 'Internal Server Error', statusCode = 500, details = null) => {
  const response = {
    success: false,
    data: null, // Explicitly set data to null for error responses
    message,
    error: message // Frontend expects 'error' field
  };

  if (details && process.env.NODE_ENV === 'development') {
    response.details = details;
  }

  return response;
};

// Add the missing paginationMeta function
const paginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
};

// Add the missing exports at the end
module.exports = {
  successResponse,
  errorResponse,
  paginationMeta,
  convertIdFields // Export the conversion utility for direct use if needed
};