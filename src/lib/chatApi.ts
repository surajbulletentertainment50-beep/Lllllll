import {
  getCachedMastiBaseAliases,
  getMastiBaseChatConversation,
  getMastiBaseChatNotifications,
  isPlaceholderActorValue,
  lookupMastiBaseUser,
  normalizeMastiAvatarUrl,
  sendMastiBaseChatMessage,
} from './mastiBase';

export interface PeerActivity {
  id?: string;
  peerId: string;
  unreadMessage: boolean;
  unreadCall: boolean;
  lastMessageAt?: string;
}

export interface RemoteChatMessage {
  id: string;
  clientId?: string;
  conversationId: string;
  senderId: string;
  senderAliases?: string[];
  senderName?: string;
  senderAvatar?: string;
  recipientId: string;
  recipientAliases?: string[];
  recipientName?: string;
  recipientAvatar?: string;
  text: string;
  createdAt: string;
  read?: boolean;
  sent?: boolean;
  isMine?: boolean;
}

export interface ChatConversationSummary {
  id: string;
  conversationId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  peerUserId?: string;
  peerEmail?: string;
  peerAuthId?: string;
  peerAliases?: string[];
  isOnline?: boolean;
  lastMessage: string;
  lastMessageAt: string;
  participants?: string[];
  unreadCount?: number;
}

export interface DirectoryUser {
  primaryId: string;
  userId: string;
  name: string;
  avatar: string;
  email?: string;
  authUid?: string;
  mastiBaseUserId?: string;
  aliases: string[];
  isVerified?: boolean;
  isOnline?: boolean;
  lastSeenAt?: string;
}

const normalizeHandle = (id: unknown): string =>
  String(id ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();

export const chatConversationId = (id1: string, id2: string): string =>
  [normalizeHandle(id1), normalizeHandle(id2)].sort().join('__');

const isCapacitorNativeRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return Boolean(w.Capacitor?.isNativePlatform?.() || w.AndroidBridge);
};

const PLACEHOLDER_CHAT_PEERS = new Set([
  '',
  'guest',
  'usr_anonymous',
  'anonymous',
  'local_user',
  'creator',
  'newuser',
  'user',
  'masti user',
  'masti creator',
  'someone',
  'user@masti.in',
]);

const isValidPeerId = (rawPeer: unknown, myOwnerSet?: Set<string>): boolean => {
  const peer = normalizeHandle(rawPeer);
  if (!peer || PLACEHOLDER_CHAT_PEERS.has(peer) || isPlaceholderActorValue(peer)) {
    return false;
  }
  if (myOwnerSet && myOwnerSet.has(peer)) return false;
  return true;
};

const expandOwnerAliases = (ownerIds: string[], primaryId?: string): string[] => {
  const seeds = [primaryId, ...(Array.isArray(ownerIds) ? ownerIds : [])]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  const cached = getCachedMastiBaseAliases(seeds);
  const out = new Set<string>();
  [...seeds, ...cached].forEach((val) => {
    const k = normalizeHandle(val);
    if (!k || PLACEHOLDER_CHAT_PEERS.has(k) || isPlaceholderActorValue(k)) return;
    out.add(k);
    if (k.includes('@')) {
      const local = k.split('@')[0]?.trim();
      if (local && !PLACEHOLDER_CHAT_PEERS.has(local) && !isPlaceholderActorValue(local)) {
        out.add(local);
      }
    }
  });
  return Array.from(out);
};

const readLocalConversations = (normMyId: string): ChatConversationSummary[] => {
  if (!normMyId) return [];
  try {
    const raw = localStorage.getItem(`@masti_conversations_${normMyId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalConversations = (normMyId: string, list: ChatConversationSummary[]) => {
  if (!normMyId) return;
  try {
    localStorage.setItem(`@masti_conversations_${normMyId}`, JSON.stringify(list.slice(0, 120)));
  } catch {}
};

const upsertLocalConversation = (
  normMyId: string,
  entry: Partial<ChatConversationSummary> & { peerId: string },
) => {
  const normPeer = normalizeHandle(entry.peerId);
  if (!normMyId || !normPeer || normPeer === normMyId || PLACEHOLDER_CHAT_PEERS.has(normPeer)) return;
  const existing = readLocalConversations(normMyId);
  const convId = entry.conversationId || chatConversationId(normMyId, normPeer);
  const idx = existing.findIndex(
    (c) => normalizeHandle(c.peerId || c.id) === normPeer || c.conversationId === convId,
  );
  const prev = idx >= 0 ? existing[idx] : undefined;
  const next: ChatConversationSummary = {
    id: normPeer,
    conversationId: convId,
    peerId: normPeer,
    peerName:
      entry.peerName && !isPlaceholderActorValue(entry.peerName)
        ? entry.peerName
        : prev?.peerName || normPeer,
    peerAvatar: normalizeMastiAvatarUrl(entry.peerAvatar || prev?.peerAvatar || ''),
    peerUserId: entry.peerUserId || prev?.peerUserId || normPeer,
    peerEmail: entry.peerEmail || prev?.peerEmail,
    peerAuthId: entry.peerAuthId || prev?.peerAuthId,
    lastMessage: entry.lastMessage ?? prev?.lastMessage ?? '',
    lastMessageAt: entry.lastMessageAt || prev?.lastMessageAt || new Date().toISOString(),
  };
  const updated =
    idx >= 0
      ? [next, ...existing.filter((_, i) => i !== idx)]
      : [next, ...existing];
  updated.sort((a, b) => (Date.parse(b.lastMessageAt) || 0) - (Date.parse(a.lastMessageAt) || 0));
  writeLocalConversations(normMyId, updated);
};

// Lightweight in-memory peer lookup cache so Inbox/Friends stays fast & rich
const peerLookupCache = new Map<
  string,
  { name?: string; avatar?: string; userId?: string; email?: string; mastiBaseUserId?: string; ts: number }
>();

const enrichPeerDetails = async (peerId: string) => {
  const key = normalizeHandle(peerId);
  if (!key) return null;
  const cached = peerLookupCache.get(key);
  if (cached && Date.now() - cached.ts < 5 * 60_000) {
    return cached;
  }
  try {
    const profile = await lookupMastiBaseUser(peerId);
    if (profile) {
      const value = {
        name: profile.name || profile.username || profile.userId,
        avatar: normalizeMastiAvatarUrl(profile.avatarUrl || ''),
        userId: profile.username || profile.userId,
        email: profile.email,
        mastiBaseUserId: profile.mastiBaseUserId,
        ts: Date.now(),
      };
      peerLookupCache.set(key, value);
      return value;
    }
  } catch {}
  peerLookupCache.set(key, { ts: Date.now() });
  return null;
};

const readMapKey = '@masti_chat_peer_read_at';
const getPeerReadTimestamps = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(readMapKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const getFriendActivity = async (params?: { peerIds?: string[] }): Promise<{ activities: PeerActivity[] }> => {
  const peerIds = Array.isArray(params?.peerIds) ? params!.peerIds : [];
  if (peerIds.length === 0) return { activities: [] };
  const readMap = getPeerReadTimestamps();
  const cachedAliases = getCachedMastiBaseAliases([]);
  const cloudThreads = await getMastiBaseChatNotifications(cachedAliases).catch(() => []);
  const byPeer = new Map<string, PeerActivity>();

  peerIds.forEach((p) => {
    const norm = normalizeHandle(p);
    if (!norm) return;
    const thread = cloudThreads.find((t) => normalizeHandle(t.peerId) === norm);
    const msgTs = thread ? Date.parse(thread.lastMessageAt) || 0 : 0;
    const readTs = readMap[norm] || 0;
    const unreadMessage = Boolean(thread && !thread.isRead && msgTs > readTs);
    byPeer.set(norm, {
      id: norm,
      peerId: norm,
      unreadMessage,
      unreadCall: false,
      lastMessageAt: thread?.lastMessageAt,
    });
  });

  return { activities: Array.from(byPeer.values()) };
};

export const markFriendActivityRead = async (params: string | { peerId: string; scope?: string }) => {
  const peerId = normalizeHandle(typeof params === 'string' ? params : params?.peerId);
  if (peerId) {
    try {
      const existing = getPeerReadTimestamps();
      existing[peerId] = Date.now();
      localStorage.setItem(readMapKey, JSON.stringify(existing));
    } catch {}
  }
  return { success: true };
};

export const getDirectChatConversations = async (
  ownerIds: string[],
  myId: string,
): Promise<ChatConversationSummary[]> => {
  const normMyId = normalizeHandle(myId);
  const ownerAliases = expandOwnerAliases(ownerIds, myId);
  const myOwnerSet = new Set(ownerAliases);
  if ((!normMyId || normMyId === 'guest') && ownerAliases.length === 0) return [];

  const cloudPromise = getMastiBaseChatNotifications(
    Array.from(new Set([...(ownerIds || []), myId, ...ownerAliases].filter(Boolean))),
  ).catch(() => []);

  const localServerPromise = (async () => {
    if (isCapacitorNativeRuntime()) return [];
    try {
      const qs = new URLSearchParams();
      if (normMyId) qs.set('userId', normMyId);
      if (ownerAliases.length > 0) qs.set('aliases', ownerAliases.join(','));
      const res = await fetch(`/api/chat/conversations?${qs.toString()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return [];
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return [];
      const data = await res.json().catch(() => null);
      return Array.isArray(data?.conversations) ? data.conversations : [];
    } catch {
      return [];
    }
  })();

  const [cloudNotifs, serverConversations] = await Promise.all([
    cloudPromise,
    localServerPromise,
  ]);
  const cachedConversations = readLocalConversations(normMyId || ownerAliases[0] || '');

  const merged = new Map<string, ChatConversationSummary>();

  const upsert = (raw: {
    peerId: string;
    peerName?: string;
    peerAvatar?: string;
    peerUserId?: string;
    peerEmail?: string;
    peerAuthId?: string;
    peerAliases?: string[];
    isOnline?: boolean;
    unreadCount?: number;
    conversationId?: string;
    lastMessage?: string;
    lastMessageAt?: string;
    participants?: string[];
  }) => {
    const normPeer = normalizeHandle(raw.peerId);
    if (!isValidPeerId(normPeer, myOwnerSet)) return;
    const convId = raw.conversationId || chatConversationId(normMyId || ownerAliases[0], normPeer);
    const prev = merged.get(normPeer);
    const nextTs = Date.parse(raw.lastMessageAt || '') || 0;
    const prevTs = prev ? Date.parse(prev.lastMessageAt || '') || 0 : -1;
    const cleanName =
      raw.peerName && !isPlaceholderActorValue(raw.peerName) ? String(raw.peerName).trim() : '';
    const prevCleanName =
      prev?.peerName && !isPlaceholderActorValue(prev.peerName) ? prev.peerName : '';
    const bestName =
      cleanName && cleanName.toLowerCase() !== normPeer
        ? cleanName
        : prevCleanName && prevCleanName.toLowerCase() !== normPeer
          ? prevCleanName
          : cleanName || prevCleanName || normPeer;
    const bestAvatar =
      normalizeMastiAvatarUrl(raw.peerAvatar || '') || prev?.peerAvatar || '';
    const mergedAliases = Array.from(
      new Set([...(prev?.peerAliases || []), ...(raw.peerAliases || []), normPeer].map(normalizeHandle).filter(Boolean)),
    );

    const useIncomingMsg = nextTs >= prevTs && Boolean(raw.lastMessage);
    merged.set(normPeer, {
      id: normPeer,
      conversationId: prev?.conversationId || convId,
      peerId: normPeer,
      peerName: bestName,
      peerAvatar: bestAvatar,
      peerUserId: raw.peerUserId || prev?.peerUserId || normPeer,
      peerEmail: raw.peerEmail || prev?.peerEmail,
      peerAuthId: raw.peerAuthId || prev?.peerAuthId,
      peerAliases: mergedAliases,
      isOnline: raw.isOnline ?? prev?.isOnline,
      unreadCount: raw.unreadCount ?? prev?.unreadCount,
      lastMessage: useIncomingMsg
        ? String(raw.lastMessage || '')
        : prev?.lastMessage || String(raw.lastMessage || ''),
      lastMessageAt:
        nextTs >= prevTs
          ? raw.lastMessageAt || prev?.lastMessageAt || new Date().toISOString()
          : prev?.lastMessageAt || raw.lastMessageAt || new Date().toISOString(),
      participants: raw.participants || prev?.participants,
    });
  };

  cloudNotifs.forEach((t) => {
    upsert({
      peerId: t.peerId,
      peerName: t.peerName,
      peerAvatar: t.peerAvatar,
      peerUserId: t.peerId.includes('@') ? undefined : t.peerId,
      peerEmail: t.peerId.includes('@') ? t.peerId : undefined,
      lastMessage: t.lastMessage,
      lastMessageAt: t.lastMessageAt,
    });
  });

  serverConversations.forEach((c: any) => {
    upsert({
      peerId: c.peerId || c.id,
      peerName: c.peerName,
      peerAvatar: c.peerAvatar,
      peerAliases: Array.isArray(c.peerAliases) ? c.peerAliases : undefined,
      isOnline: Boolean(c.isOnline),
      unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : undefined,
      conversationId: c.conversationId,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      participants: c.participants,
    });
  });

  cachedConversations.forEach((c) => {
    upsert(c);
  });

  // Enrich up to 5 recent peers if their name is just a raw ID/email or avatar is empty
  const list = Array.from(merged.values()).sort(
    (a, b) => (Date.parse(b.lastMessageAt) || 0) - (Date.parse(a.lastMessageAt) || 0),
  );
  const toEnrich = list
    .filter((c) => !c.peerAvatar || c.peerName.toLowerCase() === c.peerId.toLowerCase())
    .slice(0, 5);
  if (toEnrich.length > 0) {
    const profiles = await Promise.all(toEnrich.map((c) => enrichPeerDetails(c.peerId)));
    toEnrich.forEach((item, idx) => {
      const p = profiles[idx];
      if (!p) return;
      if (p.name && item.peerName.toLowerCase() === item.peerId.toLowerCase()) {
        item.peerName = p.name;
      }
      if (p.avatar && !item.peerAvatar) {
        item.peerAvatar = p.avatar;
      }
      if (p.userId) item.peerUserId = p.userId;
      if (p.email) item.peerEmail = p.email;
    });
  }

  writeLocalConversations(normMyId || ownerAliases[0] || '', list);
  return list;
};

const pickUniqueCandidates = (values: unknown[], limit = 4): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const val of values) {
    const raw = String(val ?? '').trim().replace(/^@+/, '');
    const lower = raw.toLowerCase();
    if (!raw || PLACEHOLDER_CHAT_PEERS.has(lower) || isPlaceholderActorValue(raw)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(raw);
    if (out.length >= limit) break;
  }
  return out;
};

export const getDirectChatMessages = async (
  ownerIds: string[],
  conversationId: string,
  myId: string,
  user1?: string,
  user2?: string,
  peerAliases?: string[],
): Promise<RemoteChatMessage[]> => {
  if (!conversationId) return [];
  const normMyId = normalizeHandle(myId);
  const expandedOwnerAliases = expandOwnerAliases(ownerIds, myId);
  const myOwnerSet = new Set(expandedOwnerAliases);

  const myCandidates = pickUniqueCandidates(
    [user1, myId, ...(Array.isArray(ownerIds) ? ownerIds : [])],
    3,
  );
  const peerCandidates = pickUniqueCandidates(
    [user2, ...(Array.isArray(peerAliases) ? peerAliases : [])],
    3,
  );

  // Build bounded distinct (myId, peerId) pairs so email vs usr_... vs handle all resolve
  const queryPairs: Array<[string, string]> = [];
  const pairSeen = new Set<string>();
  for (const m of myCandidates) {
    for (const p of peerCandidates) {
      if (normalizeHandle(m) === normalizeHandle(p)) continue;
      const key = `${normalizeHandle(m)}::${normalizeHandle(p)}`;
      if (pairSeen.has(key)) continue;
      pairSeen.add(key);
      queryPairs.push([m, p]);
      if (queryPairs.length >= 6) break;
    }
    if (queryPairs.length >= 6) break;
  }

  const alternateConvIds = Array.from(
    new Set([
      conversationId,
      ...queryPairs.map(([a, b]) => chatConversationId(a, b)),
    ]),
  );

  const cloudMessagesPromise =
    queryPairs.length > 0
      ? Promise.all(queryPairs.map(([a, b]) => getMastiBaseChatConversation(a, b))).then((groups) =>
          groups.flat(),
        )
      : Promise.resolve([]);

  const localServerMessagesPromise = (async () => {
    if (isCapacitorNativeRuntime()) return [];
    try {
      const qs = new URLSearchParams({
        conversationId,
        conversationIds: alternateConvIds.join(','),
        myId: normMyId,
        aliases: expandedOwnerAliases.join(','),
        peerId: normalizeHandle(user2 || peerCandidates[0] || ''),
        peerAliases: expandOwnerAliases(peerAliases || [], user2).join(','),
      });
      const res = await fetch(`/api/chat/messages?${qs.toString()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return [];
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return [];
      const data = await res.json().catch(() => null);
      return Array.isArray(data?.messages) ? data.messages : [];
    } catch {
      return [];
    }
  })();

  const [cloudMessages, serverMessages] = await Promise.all([
    cloudMessagesPromise,
    localServerMessagesPromise,
  ]);

  let cachedMessages: any[] = [];
  try {
    const raw = localStorage.getItem(`@masti_chat_msgs_${conversationId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) cachedMessages = parsed;
    }
  } catch {}

  const allRaw = [...cloudMessages, ...serverMessages, ...cachedMessages];
  const deduped: RemoteChatMessage[] = [];
  const seenIds = new Set<string>();
  const seenClientIds = new Set<string>();
  const seenSemantic = new Set<string>();

  for (const m of allRaw) {
    if (!m || typeof m !== 'object') continue;
    const text = String(m.text ?? m.message ?? '').trim();
    if (!text) continue;
    const senderRaw = String(m.senderId || m.userId || '').trim();
    const normSender = normalizeHandle(senderRaw);
    const normRecipient = normalizeHandle(m.recipientId || m.receiverId || '');
    const createdAt = String(m.createdAt || m.timestamp || new Date().toISOString());
    const tsBucket = Math.round((Date.parse(createdAt) || Date.now()) / 5000);
    const id = String(m.id || m.messageId || `msg_${normSender}_${tsBucket}_${text.slice(0, 12)}`);
    const clientId = m.clientId ? String(m.clientId) : undefined;
    const isMine = myOwnerSet.has(normSender) || (Boolean(normMyId) && normSender === normMyId);

    // Semantic key collapses cloud + Express + localStorage copies of the exact same message
    const semanticKey = `${isMine ? 'me' : normSender}::${text}::${tsBucket}`;
    const semanticPrevBucket = `${isMine ? 'me' : normSender}::${text}::${tsBucket - 1}`;
    const semanticNextBucket = `${isMine ? 'me' : normSender}::${text}::${tsBucket + 1}`;

    if (id && !id.startsWith('local_') && seenIds.has(id)) continue;
    if (clientId && seenClientIds.has(clientId)) continue;
    if (seenSemantic.has(semanticKey) || seenSemantic.has(semanticPrevBucket) || seenSemantic.has(semanticNextBucket)) {
      continue;
    }

    if (id) seenIds.add(id);
    if (clientId) seenClientIds.add(clientId);
    seenSemantic.add(semanticKey);

    deduped.push({
      id,
      clientId,
      conversationId,
      senderId: normSender || senderRaw,
      senderAliases: Array.isArray(m.senderAliases) ? m.senderAliases : undefined,
      senderName:
        m.senderName && !isPlaceholderActorValue(m.senderName)
          ? String(m.senderName)
          : normSender || senderRaw,
      senderAvatar: normalizeMastiAvatarUrl(m.senderAvatar || ''),
      recipientId: normRecipient,
      recipientAliases: Array.isArray(m.recipientAliases) ? m.recipientAliases : undefined,
      recipientName: m.recipientName ? String(m.recipientName) : undefined,
      recipientAvatar: normalizeMastiAvatarUrl(m.recipientAvatar || ''),
      text,
      createdAt,
      read: Boolean(m.read),
      sent: true,
      isMine,
    });
  }

  deduped.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));

  try {
    localStorage.setItem(`@masti_chat_msgs_${conversationId}`, JSON.stringify(deduped.slice(-200)));
  } catch {}

  const latest = deduped[deduped.length - 1];
  const primaryPeer = user2 || peerCandidates[0];
  if (latest && (normMyId || expandedOwnerAliases[0]) && primaryPeer) {
    upsertLocalConversation(normMyId || expandedOwnerAliases[0], {
      peerId: primaryPeer,
      conversationId,
      lastMessage: latest.text,
      lastMessageAt: latest.createdAt,
    });
  }

  return deduped;
};

export const sendDirectChatMessage = async (params: {
  conversationId: string;
  senderId: string;
  senderMessagingId?: string;
  senderNotificationOwnerId?: string;
  senderAliases?: string[];
  senderName?: string;
  senderAvatar?: string;
  recipientId: string;
  recipientMessagingId?: string;
  recipientNotificationOwnerId?: string;
  recipientAliases?: string[];
  recipientName?: string;
  recipientAvatar?: string;
  text: string;
  clientId?: string;
}): Promise<RemoteChatMessage> => {
  const rawSender = String(params.senderId || params.senderMessagingId || '').trim();
  const rawRecipient = String(params.recipientId || params.recipientMessagingId || '').trim();
  const normSender = normalizeHandle(params.senderMessagingId || rawSender);
  const normRecipient = normalizeHandle(params.recipientMessagingId || rawRecipient);
  const clientId = params.clientId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();

  // Record outgoing thread locally right away so Inbox / Friends shows it cleanly
  if (normSender && normRecipient) {
    upsertLocalConversation(normSender, {
      peerId: normRecipient,
      peerName: params.recipientName || rawRecipient,
      peerAvatar: params.recipientAvatar || '',
      peerEmail: rawRecipient.includes('@') ? rawRecipient : undefined,
      conversationId: params.conversationId,
      lastMessage: params.text,
      lastMessageAt: nowIso,
    });
  }

  // 1. Send to MastiBase Cloud API (cross-device Web <-> Android APK delivery)
  const cloudPromise = sendMastiBaseChatMessage({
    userId: rawSender,
    userName: params.senderName || rawSender,
    senderId: rawSender,
    senderName: params.senderName || rawSender,
    senderAvatar: params.senderAvatar || '',
    receiverId: rawRecipient,
    receiverName: params.recipientName || rawRecipient,
    receiverAvatar: params.recipientAvatar || '',
    message: params.text,
    clientId,
  });

  // 2. Send to Express + WebSocket real-time server (idempotent by clientId)
  const serverPayload = {
    conversationId: params.conversationId,
    senderId: normSender || rawSender,
    senderAliases: [
      rawSender,
      normSender,
      params.senderMessagingId,
      ...(params.senderAliases || []),
    ].filter(Boolean),
    senderName: params.senderName,
    senderAvatar: params.senderAvatar,
    recipientId: normRecipient || rawRecipient,
    recipientAliases: [
      rawRecipient,
      normRecipient,
      params.recipientMessagingId,
      ...(params.recipientAliases || []),
    ].filter(Boolean),
    recipientName: params.recipientName,
    recipientAvatar: params.recipientAvatar,
    text: params.text,
    clientId,
  };

  if (!isCapacitorNativeRuntime() && wsSocket && wsSocket.readyState === WebSocket.OPEN) {
    try {
      wsSocket.send(JSON.stringify({ type: 'chat:send', payload: serverPayload }));
    } catch {}
  }

  const serverPromise = (async () => {
    if (isCapacitorNativeRuntime()) return null;
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPayload),
      });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return null;
      return await res.json().catch(() => null);
    } catch {
      return null;
    }
  })();

  const [cloudRes, serverRes] = await Promise.all([cloudPromise, serverPromise]);

  const cloudMsg = (cloudRes as any)?.message || (cloudRes as any)?.data;
  const serverMsg = serverRes?.message;
  const finalMsg: RemoteChatMessage = {
    id: String(serverMsg?.id || cloudMsg?.id || `msg_${Date.now()}`),
    clientId,
    conversationId: params.conversationId,
    senderId: normSender || rawSender,
    senderName: params.senderName || normSender,
    senderAvatar: normalizeMastiAvatarUrl(params.senderAvatar || ''),
    recipientId: normRecipient || rawRecipient,
    recipientName: params.recipientName,
    recipientAvatar: normalizeMastiAvatarUrl(params.recipientAvatar || ''),
    text: params.text,
    createdAt: String(serverMsg?.createdAt || cloudMsg?.createdAt || nowIso),
    read: Boolean(serverMsg?.read),
    sent: true,
    isMine: true,
  };

  if (cloudRes?.success === false && !serverRes?.success) {
    throw new Error((cloudRes as any)?.error || 'Message send nahi ho saka.');
  }

  try {
    const raw = localStorage.getItem(`@masti_chat_msgs_${params.conversationId}`);
    const list: any[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(list) ? list.filter((m) => m?.clientId !== clientId) : [];
    filtered.push(finalMsg);
    localStorage.setItem(`@masti_chat_msgs_${params.conversationId}`, JSON.stringify(filtered.slice(-200)));
  } catch {}

  return finalMsg;
};

// ── Live User Directory API ──────────────────────────────────────────────
export const registerChatDirectoryUser = async (profile: {
  primaryId?: string;
  userId?: string;
  name?: string;
  avatar?: string;
  email?: string;
  authUid?: string;
  mastiBaseUserId?: string;
  aliases?: string[];
  isVerified?: boolean;
}) => {
  if (isCapacitorNativeRuntime()) return null;
  try {
    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
};

export const searchDirectoryUsers = async (
  query = '',
  excludeAliases: string[] = [],
): Promise<DirectoryUser[]> => {
  if (isCapacitorNativeRuntime()) return [];
  try {
    const qs = new URLSearchParams();
    if (query.trim()) qs.set('q', query.trim());
    if (excludeAliases.length > 0) qs.set('exclude', excludeAliases.join(','));
    const res = await fetch(`/api/users/directory?${qs.toString()}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return [];
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return [];
    const data = await res.json().catch(() => null);
    return Array.isArray(data?.users) ? data.users : [];
  } catch {
    return [];
  }
};

export const markDirectChatRead = async (params: {
  conversationId: string;
  readerAliases: string[];
  peerAliases: string[];
}) => {
  if (isCapacitorNativeRuntime()) return;
  if (wsSocket && wsSocket.readyState === WebSocket.OPEN) {
    try {
      wsSocket.send(JSON.stringify({ type: 'chat:read', ...params }));
    } catch {}
  }
  try {
    await fetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {}
};

// ── Real-Time WebSocket + SSE Chat Client ────────────────────────────────
export type RealtimeChatEvent =
  | { type: 'chat:message'; message: RemoteChatMessage }
  | { type: 'chat:typing'; conversationId: string; senderId: string; senderAliases: string[]; isTyping: boolean }
  | { type: 'chat:read'; conversationId: string; readerAliases: string[] }
  | { type: 'presence:snapshot'; onlineAliases: string[] }
  | { type: 'presence:update'; aliases: string[]; isOnline: boolean }
  | { type: 'reconnected' };

let wsSocket: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsPingTimer: ReturnType<typeof setInterval> | null = null;
let wsBackoffMs = 800;
let wsHasConnectedOnce = false;
let wsCurrentIdentity: {
  primaryId: string;
  userId?: string;
  name?: string;
  avatar?: string;
  email?: string;
  authUid?: string;
  mastiBaseUserId?: string;
  aliases: string[];
  isVerified?: boolean;
} | null = null;
const wsEventSubscribers = new Set<(event: RealtimeChatEvent) => void>();

const emitRealtimeEvent = (event: RealtimeChatEvent) => {
  wsEventSubscribers.forEach((cb) => {
    try {
      cb(event);
    } catch {}
  });
};

const sendWsIdentify = () => {
  if (!wsSocket || wsSocket.readyState !== WebSocket.OPEN || !wsCurrentIdentity) return;
  try {
    wsSocket.send(JSON.stringify({
      type: 'auth:identify',
      ...wsCurrentIdentity,
    }));
  } catch {}
};

const ensureWebSocketConnected = () => {
  if (typeof window === 'undefined' || isCapacitorNativeRuntime()) return;
  if (!/^https?:$/i.test(window.location.protocol)) return;
  if (typeof WebSocket === 'undefined') return;
  if (wsSocket && (wsSocket.readyState === WebSocket.OPEN || wsSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${window.location.host}/ws/chat`;

  try {
    const sock = new WebSocket(wsUrl);
    wsSocket = sock;

    sock.onopen = () => {
      const wasReconnect = wsHasConnectedOnce;
      wsHasConnectedOnce = true;
      wsBackoffMs = 800;
      sendWsIdentify();
      if (wsPingTimer) clearInterval(wsPingTimer);
      wsPingTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) {
          try {
            sock.send(JSON.stringify({ type: 'ping' }));
          } catch {}
        }
      }, 25000);
      if (wasReconnect) {
        emitRealtimeEvent({ type: 'reconnected' });
      }
    };

    sock.onmessage = (evt) => {
      try {
        const data = JSON.parse(String(evt.data || ''));
        if (!data || typeof data !== 'object') return;
        if (data.type === 'chat:message' && data.message) {
          emitRealtimeEvent({ type: 'chat:message', message: data.message });
        } else if (data.type === 'chat:typing') {
          emitRealtimeEvent({
            type: 'chat:typing',
            conversationId: String(data.conversationId || ''),
            senderId: String(data.senderId || ''),
            senderAliases: Array.isArray(data.senderAliases) ? data.senderAliases : [],
            isTyping: Boolean(data.isTyping),
          });
        } else if (data.type === 'chat:read') {
          emitRealtimeEvent({
            type: 'chat:read',
            conversationId: String(data.conversationId || ''),
            readerAliases: Array.isArray(data.readerAliases) ? data.readerAliases : [],
          });
        } else if (data.type === 'presence:snapshot') {
          emitRealtimeEvent({
            type: 'presence:snapshot',
            onlineAliases: Array.isArray(data.onlineAliases) ? data.onlineAliases : [],
          });
        } else if (data.type === 'presence:update') {
          emitRealtimeEvent({
            type: 'presence:update',
            aliases: Array.isArray(data.aliases) ? data.aliases : [],
            isOnline: Boolean(data.isOnline),
          });
        }
      } catch {}
    };

    sock.onclose = () => {
      if (wsPingTimer) {
        clearInterval(wsPingTimer);
        wsPingTimer = null;
      }
      if (wsSocket === sock) {
        wsSocket = null;
      }
      if (wsCurrentIdentity && !wsReconnectTimer) {
        const delay = wsBackoffMs;
        wsBackoffMs = Math.min(5000, Math.round(wsBackoffMs * 1.6));
        wsReconnectTimer = setTimeout(() => {
          wsReconnectTimer = null;
          ensureWebSocketConnected();
        }, delay);
      }
    };

    sock.onerror = () => {
      // onclose handles backoff reconnect cleanly
    };
  } catch {}
};

export const identifyChatWebSocket = (identity: {
  primaryId: string;
  userId?: string;
  name?: string;
  avatar?: string;
  email?: string;
  authUid?: string;
  mastiBaseUserId?: string;
  aliases: string[];
  isVerified?: boolean;
}) => {
  const cleanAliases = Array.from(
    new Set(
      [identity.primaryId, ...(identity.aliases || [])]
        .map(normalizeHandle)
        .filter((a) => Boolean(a) && !PLACEHOLDER_CHAT_PEERS.has(a)),
    ),
  );
  if (cleanAliases.length === 0) return;
  wsCurrentIdentity = {
    ...identity,
    primaryId: normalizeHandle(identity.primaryId) || cleanAliases[0],
    aliases: cleanAliases,
  };
  ensureWebSocketConnected();
  sendWsIdentify();
};

export const sendWsChatTyping = (params: {
  conversationId: string;
  senderId: string;
  senderAliases: string[];
  recipientId: string;
  recipientAliases: string[];
  isTyping: boolean;
}) => {
  if (!wsSocket || wsSocket.readyState !== WebSocket.OPEN) return;
  try {
    wsSocket.send(JSON.stringify({ type: 'chat:typing', ...params }));
  } catch {}
};

export const subscribeToChatEvents = (onEvent: (event: RealtimeChatEvent) => void) => {
  wsEventSubscribers.add(onEvent);
  ensureWebSocketConnected();
  return () => {
    wsEventSubscribers.delete(onEvent);
  };
};

export const subscribeToChatStream = (
  userIds: string | string[],
  onMessage: (msg: RemoteChatMessage) => void,
) => {
  if (isCapacitorNativeRuntime()) return () => {};
  const list = Array.isArray(userIds) ? userIds : [userIds];
  const aliases = Array.from(new Set(list.map(normalizeHandle).filter(Boolean)));
  if (aliases.length === 0 || typeof window === 'undefined' || !window.EventSource) return () => {};
  try {
    const es = new EventSource(
      `/api/chat/stream?userId=${encodeURIComponent(aliases[0])}&aliases=${encodeURIComponent(aliases.join(','))}`,
    );
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'new_message' && data.message) onMessage(data.message);
      } catch {}
    };
    es.onerror = () => {};
    return () => {
      es.close();
    };
  } catch {
    return () => {};
  }
};
