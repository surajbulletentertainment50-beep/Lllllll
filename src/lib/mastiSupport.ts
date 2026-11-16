export interface SupportChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  isStaff?: boolean;
  isMine: boolean;
  historySynced?: boolean;
  directChatSynced?: boolean;
}

export interface SupportIdentity {
  userId: string;
  appUserId: string;
  senderId: string;
  senderName: string;
  name: string;
  email: string;
}

export const getSupportIdentity = async (user?: any): Promise<SupportIdentity> => {
  const currentUser = user || {};
  const uid = currentUser?.uid || currentUser?.accountId || 'guest_user';
  const uname = currentUser?.displayName || currentUser?.name || 'Masti User';
  return {
    userId: uid,
    appUserId: uid,
    senderId: uid,
    senderName: uname,
    name: uname,
    email: user?.email || 'user@masti.in',
  };
};

export const getSupportConversation = async (_identity: SupportIdentity): Promise<SupportChatMessage[]> => [
  {
    id: 'sup_1',
    senderId: 'masti_support',
    senderName: 'Masti Support Team',
    text: 'Namaste! How can we assist you with your Masti account today?',
    createdAt: '10:00 AM',
    isStaff: true,
    isMine: false,
  },
];

export const sendSupportChatMessage = async (
  _identity: SupportIdentity,
  text: string,
): Promise<SupportChatMessage> => ({
  id: 'sup_' + Date.now(),
  senderId: 'user',
  senderName: 'You',
  text,
  createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  isStaff: false,
  isMine: true,
  historySynced: true,
  directChatSynced: true,
});

export const submitSupportBugReport = async (report: any, _arg2?: any, _arg3?: any) => ({
  success: true,
  ticketId: 'TKT-' + Math.floor(100000 + Math.random() * 900000),
  report,
  ticketDelivered: true,
  historySynced: true,
  directChatSynced: true,
});
