import { z } from 'zod';

export const createRoomSchema = z.object({
  roomName: z.string().trim().max(50).optional(),
  displayName: z.string().trim().min(1, 'Display name is required').max(30, 'Display name too long'),
  sessionToken: z.string().max(128).optional()
});

export const joinRoomSchema = z.object({
  roomId: z.string().trim().min(3).max(12),
  displayName: z.string().trim().min(1, 'Display name is required').max(30, 'Display name too long'),
  sessionToken: z.string().max(128).optional()
});

export const reconnectSessionSchema = z.object({
  roomId: z.string().trim().min(3).max(12),
  sessionToken: z.string().min(10).max(128)
});

export const participantTargetSchema = z.object({
  roomId: z.string().trim().max(12).optional(),
  targetParticipantId: z.string().min(1).max(50)
});

export const clearLoungeSchema = z.object({
  roomId: z.string().trim().max(12).optional()
}).optional().default({});

export const toggleInvitationsSchema = z.object({
  roomId: z.string().trim().max(12).optional(),
  open: z.boolean()
});

export const toggleRaiseHandSchema = z.object({
  roomId: z.string().trim().max(12).optional()
}).optional().default({});

export const endRoomSchema = z.object({
  roomId: z.string().trim().max(12).optional()
}).optional().default({});

export const leaveRoomSchema = z.object({
  roomId: z.string().trim().max(12).optional(),
  transferToParticipantId: z.string().max(50).optional(),
  autoTransfer: z.boolean().optional()
}).optional().default({});

export const updateMicStateSchema = z.object({
  roomId: z.string().trim().max(12).optional(),
  microphoneState: z.enum(['ON', 'MUTED', 'CONNECTING', 'DENIED', 'OFF'])
});

export const updateSpeakingSchema = z.object({
  roomId: z.string().trim().max(12).optional(),
  isSpeaking: z.boolean()
});

export const sendPartyChatSchema = z.object({
  roomId: z.string().trim().max(12).optional(),
  text: z.string().trim().min(1, 'Chat text cannot be empty').max(500, 'Chat message exceeds 500 characters')
});

export const reorderPartySchema = z.object({
  roomId: z.string().trim().max(12).optional(),
  orderedParticipantIds: z.array(z.string().min(1).max(50)).max(8, 'Party capacity is at most 8')
});

export const sdpSignalSchema = z.object({
  type: z.enum(['offer', 'answer', 'rollback']),
  sdp: z.string().max(32768, 'SDP size exceeds 32 KB limit')
});

export const iceCandidateSignalSchema = z.object({
  candidate: z.string().max(2048, 'ICE candidate exceeds 2 KB limit').optional(),
  sdpMid: z.string().max(50).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(),
  usernameFragment: z.string().max(100).nullable().optional()
});

export const signalPeerSchema = z.object({
  roomId: z.string().trim().max(12).optional(),
  targetSocketId: z.string().min(1, 'Target socket ID is required').max(100),
  targetParticipantId: z.string().max(50).optional(),
  type: z.enum(['offer', 'answer', 'ice-candidate']),
  signal: z.any()
}).refine((data) => {
  if (data.type === 'offer' || data.type === 'answer') {
    return sdpSignalSchema.safeParse(data.signal).success;
  }
  if (data.type === 'ice-candidate') {
    // Candidates can be empty object or null during gathering completion
    if (!data.signal || Object.keys(data.signal).length === 0) return true;
    return iceCandidateSignalSchema.safeParse(data.signal).success;
  }
  return false;
}, {
  message: 'Invalid WebRTC signal payload format or payload exceeds maximum allowed size'
});

/**
 * Validates an incoming socket event payload against a Zod schema.
 * If validation fails, calls the callback (if present) with a typed error and returns null.
 */
export function validateEventPayload<T>(
  schema: z.ZodSchema<T>,
  payload: unknown,
  callback?: (response: { success: boolean; errorCode?: any; error?: string }) => void
): T | null {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const errorMsg = result.error.issues.map((e) => e.message).join('; ') || 'Invalid payload';
    if (typeof callback === 'function') {
      callback({
        success: false,
        errorCode: 'INVALID_INPUT',
        error: errorMsg
      });
    }
    return null;
  }
  return result.data;
}
