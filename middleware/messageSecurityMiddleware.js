const User = require('../models/User');
const Property = require('../models/Property');
const { errorResponse } = require('../utils/responseFormatter');

// Enforce message routing rules: No Buyer ↔ Seller direct communication
const enforceMessageRouting = async (req, res, next) => {
  try {
    const { toUserId, threadId } = req.body;
    const fromUser = req.user;
    
    // If using existing thread, validate participants
    if (threadId) {
      const MessageThread = require('../models/MessageThread');
      const thread = await MessageThread.findById(threadId)
        .populate('participants', 'role');
      
      if (!thread) {
        return res.status(404).json(
          errorResponse('Message thread not found', 404)
        );
      }
      
      // Check if user is participant
      const isParticipant = thread.participants.some(
        p => p._id.toString() === fromUser.id
      );
      
      if (!isParticipant) {
        return res.status(403).json(
          errorResponse('Not authorized to send message in this thread', 403)
        );
      }
      
      // Validate existing thread follows routing rules
      const roles = thread.participants.map(p => p.role);
      const hasBuyer = roles.includes('buyer');
      const hasSeller = roles.includes('seller');
      const hasAgent = roles.includes('agent');
      
      // Block direct buyer-seller communication
      if (hasBuyer && hasSeller && !hasAgent) {
        return res.status(403).json(
          errorResponse('Direct buyer-seller communication not allowed. Use agent channel.', 403)
        );
      }
      
      return next();
    }
    
    // For new threads, validate recipient
    if (!toUserId) {
      return res.status(400).json(
        errorResponse('Recipient user ID is required for new threads', 400)
      );
    }
    
    const toUser = await User.findById(toUserId).select('role');
    if (!toUser) {
      return res.status(404).json(
        errorResponse('Recipient user not found', 404)
      );
    }
    
    const fromRole = fromUser.role;
    const toRole = toUser.role;
    
    // Enforce routing rules
    if ((fromRole === 'buyer' && toRole === 'seller') || 
        (fromRole === 'seller' && toRole === 'buyer')) {
      return res.status(403).json(
        errorResponse('Use agent channel', 403)
      );
    }
    
    // Validate allowed combinations
    const allowedCombinations = [
      ['buyer', 'agent'],
      ['agent', 'buyer'],
      ['agent', 'seller'],
      ['seller', 'agent'],
      ['admin', 'buyer'],
      ['admin', 'seller'],
      ['admin', 'agent'],
      ['buyer', 'admin'],
      ['seller', 'admin'],
      ['agent', 'admin']
    ];
    
    const isAllowed = allowedCombinations.some(
      ([from, to]) => fromRole === from && toRole === to
    );
    
    if (!isAllowed) {
      return res.status(403).json(
        errorResponse('Invalid messaging combination', 403)
      );
    }
    
    next();
  } catch (error) {
    console.error('Message routing error:', error);
    return res.status(500).json(
      errorResponse('Server error during message routing validation', 500)
    );
  }
};

module.exports = {
  enforceMessageRouting
};