const MessageThread = require('../models/MessageThread');
const Message = require('../models/Message');
const User = require('../models/User');
const Property = require('../models/Property');
const { successResponse, errorResponse, paginationMeta } = require('../utils/responseFormatter');

// Normalize a thread to the frontend-friendly "conversation" shape
const toConversationDTO = (thread, currentUserId) => {
  try {
    const participants = (thread.participants || []).map(p => {
      const userId = p.user?._id?.toString?.() || p.user?.toString?.() || 'unknown';
      return {
        userId,
        name: p.user?.name || 'User',
        role: p.role || 'user',
        avatar: p.user?.avatar || null
      };
    });

    const lastMessage = thread.lastMessage
      ? {
          senderId: thread.lastMessage.sender?._id?.toString?.() || thread.lastMessage.sender?.toString?.() || 'unknown',
          content: thread.lastMessage.content || '',
          sentAt: thread.lastMessage.sentAt || thread.updatedAt,
        }
      : null;

    return {
      id: thread._id?.toString() || 'unknown',
      participants,
      propertyId: thread.context?.property?._id?.toString?.() || thread.context?.property?.toString?.() || null,
      propertyTitle: thread.context?.property?.title || null,
      lastMessage,
      updatedAt: thread.updatedAt || new Date()
    };
  } catch (error) {
    console.error('❌ toConversationDTO error:', error);
    // Return minimal safe object
    return {
      id: thread._id?.toString() || 'unknown',
      participants: [],
      propertyId: null,
      propertyTitle: null,
      lastMessage: null,
      updatedAt: new Date()
    };
  }
};

// @desc    Get all message threads for the authenticated user
// @route   GET /api/messages
// @access  Private
const getUserThreads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const baseQuery = { 'participants.user': req.user.id, isDeleted: false };

    const threads = await MessageThread.find(baseQuery)
      .populate('participants.user', 'name email avatar role')
      .populate('context.property', 'title')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await MessageThread.countDocuments(baseQuery);

    const data = threads.map(t => toConversationDTO(t, req.user.id));

    res.json(
      successResponse(
        data,
        'Message threads retrieved successfully',
        200,
        paginationMeta(page, limit, total)
      )
    );
  } catch (error) {
    console.error('getUserThreads error:', error);
    res.status(500).json(
      errorResponse('Server error retrieving message threads', 500)
    );
  }
};

// @desc    Get conversation messages for a thread
// @route   GET /api/messages/:threadId
// @access  Private
const getConversation = async (req, res) => {
  try {
    const { threadId } = req.params;
    console.log('📥 getConversation called for threadId:', threadId, 'by user:', req.user.id);

    const thread = await MessageThread.findById(threadId)
      .populate('participants.user', 'name role')
      .lean();
    if (!thread) {
      console.log('❌ Thread not found:', threadId);
      return res.status(404).json(errorResponse('Message thread not found', 404));
    }

    console.log('✅ Thread found:', thread._id);
    console.log('🔍 Thread participants:', thread.participants.map(p => ({ 
      userId: p.user?._id?.toString() || p.user?.toString(),
      role: p.role 
    })));
    console.log('🔍 Current user ID:', req.user.id);

    // Ensure requester is a participant - improved comparison
    const isParticipant = (thread.participants || []).some(p => {
      const participantId = p.user?._id?.toString() || p.user?.toString();
      const currentUserId = req.user.id?.toString() || req.user.id;
      console.log(`   Comparing: ${participantId} === ${currentUserId} → ${participantId === currentUserId}`);
      return participantId === currentUserId;
    });
    
    if (!isParticipant) {
      console.log('❌ User not a participant in this thread');
      return res.status(403).json(errorResponse('Not authorized to view this conversation', 403));
    }
    
    console.log('✅ User IS a participant!');

    console.log('✅ User is a participant, fetching messages...');

    const messages = await Message.find({ thread: threadId, isDeleted: false })
      .populate('sender', 'name role')
      .sort({ createdAt: 1 })
      .lean();

    console.log(`📨 Found ${messages.length} messages in database for thread ${threadId}`);

    const participants = (thread.participants || []).map(p => p.user.toString());

    const normalized = messages.map(m => {
      const senderId = m.sender?._id?.toString?.() || m.sender?.toString?.();
      const receiverId = m.receiver?.toString?.() || participants.find(uid => uid !== senderId);
      return ({
        id: m._id.toString(),
        conversationId: threadId,
        conversation_id: threadId,
        senderId,
        sender_id: senderId,
        receiverId,
        receiver_id: receiverId,
        senderName: m.sender?.name || 'User',
        senderRole: m.sender?.role || 'user',
        messageText: m.content?.text || '',
        message_text: m.content?.text || '',
        timestamp: m.createdAt,
        read: (m.readBy || []).some(r => r.user?.toString() === req.user.id)
      });
    });

    console.log('📤 Sending', normalized.length, 'normalized messages to frontend');
    res.json(successResponse(normalized, 'Conversation retrieved successfully'));
  } catch (error) {
    console.error('❌ getConversation error:', error);
    res.status(500).json(errorResponse('Server error retrieving conversation', 500));
  }
};

// @desc    Mark all messages in a thread as read for the current user
// @route   PUT /api/messages/:threadId/read
// @access  Private
const markThreadAsRead = async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await MessageThread.findById(threadId);
    if (!thread) return res.status(404).json(errorResponse('Message thread not found', 404));

    const isParticipant = thread.participants.some(p => p.user.toString() === req.user.id);
    if (!isParticipant) {
      return res.status(403).json(errorResponse('Not authorized for this thread', 403));
    }

    await Message.updateMany(
      { thread: threadId, 'readBy.user': { $ne: req.user.id } },
      { $push: { readBy: { user: req.user.id, readAt: new Date() } } }
    );

    await thread.markAsRead(req.user.id);

    res.json(successResponse({ threadId }, 'Thread marked as read'));
  } catch (error) {
    console.error('markThreadAsRead error:', error);
    res.status(500).json(errorResponse('Failed to mark thread as read', 500));
  }
};

// @desc    Send message (creates thread if needed)
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
  try {
    // Support multiple payload shapes to mirror buyer↔agent and required spec
    const body = req.body || {};
    const recipientId = body.recipientId || body.receiverId || body.receiver_id || body.toUserId;
    const text = body.text || body.message_text || body.message || body.content;
    const propertyId = body.propertyId || body.property_id;
    const threadId = body.threadId || body.conversationId || body.conversation_id;

    if (!text || (!threadId && !recipientId)) {
      return res.status(400).json(errorResponse('Missing required fields to send message', 400));
    }

    let thread = null;
    if (threadId) {
      thread = await MessageThread.findById(threadId);
      if (!thread) return res.status(404).json(errorResponse('Message thread not found', 404));
    } else {
      // Find existing active thread between two users for a property context
      thread = await MessageThread.findOne({
        'participants.user': { $all: [req.user.id, recipientId] },
        ...(propertyId ? { 'context.property': propertyId } : {}),
        status: 'active',
        isDeleted: false
      });
      if (!thread) {
        // Determine roles for participants dynamically (seller ⇄ agent only)
        const senderRole = req.user.role;
        const recipient = await User.findById(recipientId).select('role').lean();
        const receiverRole = recipient?.role;

        // Validate allowed pair
        const isSellerAgentPair =
          (senderRole === 'seller' && receiverRole === 'agent') ||
          (senderRole === 'agent' && receiverRole === 'seller');
        if (!isSellerAgentPair) {
          return res.status(400).json(errorResponse('Only seller↔agent messages are allowed', 400));
        }

        const participants = senderRole === 'seller'
          ? [
              { user: req.user.id, role: 'seller' },
              { user: recipientId, role: 'agent' }
            ]
          : [
              { user: req.user.id, role: 'agent' },
              { user: recipientId, role: 'seller' }
            ];

        thread = await MessageThread.create({
          participants,
          context: propertyId ? { property: propertyId, type: 'general' } : undefined,
          messageCount: 0
        });
      }
    }

    // Determine receiver based on participants if not explicitly provided
    const receiverId = recipientId || (thread.participants || []).find(p => p.user.toString() !== req.user.id)?.user?.toString();

    // Create message document
    const messageDoc = await Message.create({
      thread: thread._id,
      sender: req.user.id,
      receiver: receiverId || null,
      content: { text: String(text) }
    });

    // Update thread lastMessage
    thread.lastMessage = {
      content: String(text),
      sender: req.user.id,
      sentAt: new Date(),
      messageType: 'text'
    };
    thread.messageCount = (thread.messageCount || 0) + 1;
    await thread.incrementUnread(req.user.id);
    await thread.save();

    const populated = await messageDoc.populate('sender', 'name role');

    // Build a unified payload that works for both socket consumers
    const socketPayload = {
      // Generic chat payload (used by ContactAgentModal / buyer↔agent)
      _id: populated._id.toString(),
      sender: req.user.id,
      receiver: receiverId,
      text: String(text),
      createdAt: populated.createdAt,
      // MessageThread-based payload (used by ChatInterface)
      id: populated._id.toString(),
      conversationId: thread._id.toString(),
      conversation_id: thread._id.toString(),
      senderId: req.user.id,
      sender_id: req.user.id,
      receiver_id: receiverId,
      senderName: populated.sender?.name,
      senderRole: populated.sender?.role,
      messageText: String(text),
      message_text: String(text),
      timestamp: populated.createdAt,
      read: false
    };

    // Emit real-time event to both participants' rooms if Socket.IO is available
    try {
      const io = req.app?.locals?.io || global.io;
      if (io) {
        // kebab-case for existing clients
        io.to(String(req.user.id)).emit('receive-message', socketPayload);
        if (receiverId) io.to(String(receiverId)).emit('receive-message', socketPayload);
        // snake_case for new clients per spec
        io.to(String(req.user.id)).emit('receive_message', socketPayload);
        if (receiverId) io.to(String(receiverId)).emit('receive_message', socketPayload);
      }
    } catch (emitErr) {
      console.warn('Socket emit failed (sendMessage):', emitErr?.message);
    }

    res.status(201).json(
      successResponse(
        {
          id: populated._id,
          conversationId: thread._id,
          conversation_id: thread._id,
          senderId: populated.sender._id,
          sender_id: populated.sender._id,
          receiver_id: receiverId,
          senderName: populated.sender.name,
          senderRole: populated.sender.role,
          messageText: populated.content.text,
          message_text: populated.content.text,
          timestamp: populated.createdAt,
          read: false
        },
        'Message sent successfully'
      )
    );
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json(errorResponse('Server error sending message', 500));
  }
};

// @desc    Ensure a thread exists between current user and other user (optionally for a property)
// @route   GET /api/messages/ensure-thread?otherUserId=...&propertyId=...
// @access  Private
const ensureThread = async (req, res) => {
  try {
    console.log('🔍 ensureThread called:', {
      userId: req.user.id,
      userRole: req.user.role,
      query: req.query
    });

    const otherUserId = req.query.otherUserId || req.query.with || req.query.userId;
    const propertyId = req.query.propertyId || req.query.property_id;
    
    if (!otherUserId) {
      console.log('❌ Missing otherUserId');
      return res.status(400).json(errorResponse('otherUserId is required', 400));
    }

    console.log('🔍 Searching for existing thread between:', req.user.id, 'and', otherUserId);

    // Try to find existing active thread
    let thread = await MessageThread.findOne({
      'participants.user': { $all: [req.user.id, otherUserId] },
      ...(propertyId ? { 'context.property': propertyId } : {}),
      status: 'active',
      isDeleted: false
    })
      .populate('participants.user', 'name email avatar role')
      .populate('context.property', 'title')
      .lean();

    if (!thread) {
      console.log('📝 No existing thread found, creating new one');
      
      // Determine roles
      const meRole = req.user.role;
      console.log('👤 Current user role:', meRole);
      
      const other = await User.findById(otherUserId).select('role name avatar').lean();
      if (!other) {
        console.log('❌ Other user not found:', otherUserId);
        return res.status(404).json(errorResponse('Other user not found', 404));
      }
      
      console.log('👤 Other user role:', other.role);
      
      const isSellerAgentPair =
        (meRole === 'seller' && other.role === 'agent') ||
        (meRole === 'agent' && other.role === 'seller');
        
      if (!isSellerAgentPair) {
        console.log('❌ Invalid role pair:', meRole, 'and', other.role);
        return res.status(400).json(errorResponse('Only seller↔agent threads are allowed', 400));
      }

      console.log('✅ Valid role pair, creating thread');

      const created = await MessageThread.create({
        participants: [
          { user: req.user.id, role: meRole },
          { user: otherUserId, role: other.role }
        ],
        context: propertyId ? { property: propertyId, type: 'general' } : undefined,
        messageCount: 0
      });
      
      thread = await MessageThread.findById(created._id)
        .populate('participants.user', 'name email avatar role')
        .populate('context.property', 'title')
        .lean();
        
      console.log('✅ Thread created:', thread._id);
    } else {
      console.log('✅ Found existing thread:', thread._id);
    }

    const dto = toConversationDTO(thread, req.user.id);
    console.log('📤 Sending thread DTO:', dto);
    
    res.json(successResponse(dto, 'Thread ensured'));
  } catch (err) {
    console.error('❌ ensureThread error:', err);
    res.status(500).json(errorResponse('Failed to ensure thread', 500));
  }
};

module.exports = {
  getUserThreads,
  getConversation,
  markThreadAsRead,
  sendMessage,
  ensureThread
};
