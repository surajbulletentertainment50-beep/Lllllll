export const createCall = async (callData: any) => ({
  id: 'call_' + Date.now(),
  callerId: callData?.callerId || '',
  callerName: callData?.callerName || '',
  callerAvatar: callData?.callerAvatar,
  receiverId: callData?.receiverId || '',
  type: callData?.type || 'video',
  status: 'ringing',
  createdAt: new Date().toISOString(),
});

export const getIncomingCalls = (_receiverId: string, _onCall: (call: any) => void) => {
  return () => {};
};

export const updateCall = async (callId: string, updates: any) => ({
  id: callId,
  ...updates,
});
