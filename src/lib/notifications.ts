/**
 * Instagram-Style Notification System for Masti Video
 * 
 * Strict User Isolation:
 * - User A liking User B's video -> notification delivered ONLY to User B.
 * - User A following User B -> notification delivered ONLY to User B.
 * - Self-actions (User A liking own video or following self) -> NEVER generates a notification.
 * - Under no condition are notification counts mixed between users.
 * 
 * Notification Record Schema:
 * - notificationId: string (unique identifier)
 * - id: string (alias to notificationId)
 * - recipientId: string (target user ID / email / handle)
 * - recipientAliases: string[] (all known aliases of recipient)
 * - senderId: string (actor user ID / email / handle)
 * - senderName: string (actor display name)
 * - senderAvatar: string (actor avatar URI)
 * - type: 'like' | 'follow' | 'comment' | 'share' | 'save'
 * - videoId?: string
 * - createdAt: string (ISO 8601 string)
 * - isRead: boolean
 * - read: boolean (synced with isRead for backwards compatibility)
 * - title: string
 * - message: string
 * - comment?: string
 */

import { db, collection, doc, setDoc, getDocs, updateDoc, deleteDoc } from './localStore';
import {
  deleteMastiBaseNotifications,
  getCachedMastiBaseAliases,
  getLocalDismissedNotificationIds,
  getLocalDismissedNotificationSignatures,
  getLocalReadNotificationIds,
  getMastiBaseNotifications,
  isMastiBaseNotificationDismissed,
  markLocalDismissedNotificationIds,
  markLocalDismissedNotificationSignatures,
  markLocalReadNotificationIds,
  preserveMastiBaseNotificationsLocally,
  resolveMastiBaseOwnerAliases,
} from './mastiBase';

export interface AppNotification {
  notificationId: string;
  id: string;
  recipientId: string;
  recipientAliases: string[];
  videoOwnerId?: string;
  senderId: string;
  senderAliases?: string[];
  senderName: string;
  senderAvatar: string;
  fromUserId: string;
  fromUserName: string;
  fromProfilePic: string;
  avatar: string;
  profilePic: string;
  type: 'like' | 'follow' | 'comment' | 'share' | 'save';
  videoId?: string;
  videoThumbnail?: string;
  createdAt: string;
  isRead: boolean;
  read: boolean;
  title: string;
  message: string;
  comment?: string;
}

export const normalizeId = (val: any): string => {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
};

const PLACEHOLDER_NOTIF_KEYS = new Set([
  'all',
  'local_user',
  'user',
  'newuser',
  'new user',
  'creator',
  'you',
  'usr_anonymous',
  'anonymous',
  'masti user',
  'masti_user',
  'mastiuser',
  'masti creator',
  'masticreator',
  'someone',
  'a fan',
  'afan',
  'guest',
  'unknown',
  'default',
  'user@masti.in',
]);

const SYSTEM_MESSAGE_TYPES = new Set([
  'support_chat_message',
  'support_chat_reply',
  'support_reply',
  'support_message',
  'support_bug_report',
  'support_bug_report_sent',
  'support_ticket_created',
  'support_ticket_message',
  'support_ticket_reply',
  'support_ticket_replied',
  'support_admin_reply',
  'admin_message',
]);

export const isValidRealNotificationActor = (rawItem: any): boolean => {
  if (!rawItem || typeof rawItem !== 'object') return false;
  const rawType = String(rawItem.type || rawItem.notificationType || '').trim().toLowerCase();
  if (SYSTEM_MESSAGE_TYPES.has(rawType)) return true;

  const actorCandidates = [
    rawItem.actorId,
    rawItem.senderId,
    rawItem.fromUserId,
    ...(Array.isArray(rawItem.senderAliases) ? rawItem.senderAliases : []),
    rawItem.username,
    rawItem.actorName,
    rawItem.senderName,
    rawItem.fromUserName,
    rawItem.userName,
  ]
    .map(normalizeId)
    .filter((k) => Boolean(k) && !PLACEHOLDER_NOTIF_KEYS.has(k) && !/^notification-/i.test(k));

  return actorCandidates.length > 0;
};

export const normalizeNotificationVideoId = (val: any): string =>
  String(val ?? '')
    .trim()
    .replace(/^db-/i, '')
    .toLowerCase();

export const normalizeNotificationCommentText = (item: any): string => {
  const direct = String(item?.comment ?? '').trim();
  let text = direct;
  if (!text) {
    const msg = String(item?.message ?? '').trim();
    const colonIdx = msg.indexOf(':');
    text = colonIdx !== -1 ? msg.slice(colonIdx + 1).trim() : msg;
  }
  return text
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

export const extractNotificationActorTokens = (rawItem: any): string[] => {
  if (!rawItem || typeof rawItem !== 'object') return [];
  const rawTokens = [
    rawItem.actorId,
    rawItem.senderId,
    rawItem.fromUserId,
    ...(Array.isArray(rawItem.senderAliases) ? rawItem.senderAliases : []),
    rawItem.username,
    rawItem.actorName,
    rawItem.senderName,
    rawItem.fromUserName,
    rawItem.userName,
  ]
    .map(normalizeId)
    .filter((k) => Boolean(k) && !PLACEHOLDER_NOTIF_KEYS.has(k) && !/^notification-/i.test(k));

  const expanded = new Set<string>(rawTokens);
  rawTokens.forEach((tok) => {
    if (tok.includes('@')) {
      const localPart = tok.split('@')[0]?.trim();
      if (localPart && !PLACEHOLDER_NOTIF_KEYS.has(localPart)) {
        expanded.add(localPart);
      }
    }
  });
  try {
    getCachedMastiBaseAliases(Array.from(expanded)).forEach((a) => {
      const norm = normalizeId(a);
      if (norm && !PLACEHOLDER_NOTIF_KEYS.has(norm)) {
        expanded.add(norm);
      }
    });
  } catch {}
  return Array.from(expanded);
};

export const extractNotificationRecipientTokens = (rawItem: any): string[] => {
  if (!rawItem || typeof rawItem !== 'object') return [];
  const tokens = [
    rawItem.recipientId,
    rawItem.videoOwnerId,
    ...(Array.isArray(rawItem.recipientAliases) ? rawItem.recipientAliases : []),
  ]
    .map(normalizeId)
    .filter((k) => Boolean(k) && k !== 'all' && !PLACEHOLDER_NOTIF_KEYS.has(k));
  const expanded = new Set<string>(tokens);
  tokens.forEach((tok) => {
    if (tok.includes('@')) {
      const localPart = tok.split('@')[0]?.trim();
      if (localPart && !PLACEHOLDER_NOTIF_KEYS.has(localPart)) {
        expanded.add(localPart);
      }
    }
  });
  return Array.from(expanded);
};

export const getSemanticNotificationType = (rawItem: any): string => {
  const t = String(rawItem?.type || rawItem?.notificationType || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (t === 'bookmark') return 'save';
  if (t === 'comments') return 'comment';
  return t || 'activity';
};

export const notificationsMatchSemantically = (
  a: any,
  b: any,
  options: { matchRecipient?: boolean } = {},
): boolean => {
  const typeA = getSemanticNotificationType(a);
  const typeB = getSemanticNotificationType(b);
  if (typeA !== typeB) return false;
  if (
    SYSTEM_MESSAGE_TYPES.has(typeA) ||
    typeA === 'chat' ||
    typeA === 'direct_chat_message'
  ) {
    return false;
  }

  const videoA = normalizeNotificationVideoId(a?.videoId || a?.mediaId);
  const videoB = normalizeNotificationVideoId(b?.videoId || b?.mediaId);
  if (typeA !== 'follow' && videoA !== videoB) return false;

  if (typeA === 'comment') {
    if (normalizeNotificationCommentText(a) !== normalizeNotificationCommentText(b)) {
      return false;
    }
  }

  const actorsA = extractNotificationActorTokens(a);
  const actorsB = extractNotificationActorTokens(b);
  if (actorsA.length === 0 || actorsB.length === 0) return false;
  const actorOverlap = actorsA.some((tok) => actorsB.includes(tok));
  if (!actorOverlap) return false;

  if (options.matchRecipient) {
    const recA = extractNotificationRecipientTokens(a);
    const recB = extractNotificationRecipientTokens(b);
    if (recA.length > 0 && recB.length > 0 && !recA.some((r) => recB.includes(r))) {
      return false;
    }
  }

  return true;
};

export const isNotificationDismissed = (
  item: any,
  dismissedIds?: Set<string>,
  dismissedSigs?: ReturnType<typeof getLocalDismissedNotificationSignatures>,
): boolean => {
  if (!item || typeof item !== 'object') return false;
  return isMastiBaseNotificationDismissed(
    item,
    dismissedIds || getLocalDismissedNotificationIds(),
    dismissedSigs || getLocalDismissedNotificationSignatures(),
  );
};

export const dedupeNotificationsSemantic = <T extends Record<string, any>>(
  items: T[],
  options: { matchRecipient?: boolean } = {},
): T[] => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const tA = Date.parse(String(a?.createdAt || '')) || 0;
    const tB = Date.parse(String(b?.createdAt || '')) || 0;
    return tB - tA;
  });

  const groups: Array<{
    item: T;
    semanticType: string;
    normVideoId: string;
    normComment: string;
    actorSet: Set<string>;
    recipientSet: Set<string>;
    mergedIds: Set<string>;
  }> = [];
  const passthrough: T[] = [];
  const passthroughIds = new Set<string>();

  for (const item of sorted) {
    if (!item || typeof item !== 'object') continue;
    const semanticType = getSemanticNotificationType(item);
    const itemId = String(item.notificationId || item.id || '').trim();

    if (
      SYSTEM_MESSAGE_TYPES.has(semanticType) ||
      semanticType === 'chat' ||
      semanticType === 'direct_chat_message'
    ) {
      if (itemId && passthroughIds.has(itemId)) continue;
      if (itemId) passthroughIds.add(itemId);
      passthrough.push(item);
      continue;
    }

    const actors = extractNotificationActorTokens(item);
    if (actors.length === 0) continue;

    const normVideoId = semanticType === 'follow' ? '' : normalizeNotificationVideoId(item.videoId || item.mediaId);
    const normComment = semanticType === 'comment' ? normalizeNotificationCommentText(item) : '';
    const recipients = extractNotificationRecipientTokens(item);

    const existingGroup = groups.find((g) => {
      if (g.semanticType !== semanticType) return false;
      if (semanticType !== 'follow' && g.normVideoId !== normVideoId) return false;
      if (semanticType === 'comment' && g.normComment !== normComment) return false;
      if (!actors.some((tok) => g.actorSet.has(tok))) return false;
      if (options.matchRecipient && recipients.length > 0 && g.recipientSet.size > 0) {
        if (!recipients.some((r) => g.recipientSet.has(r))) return false;
      }
      return true;
    });

    if (!existingGroup) {
      const mergedIds = new Set<string>();
      if (itemId) mergedIds.add(itemId);
      if (Array.isArray(item._mergedIds)) {
        item._mergedIds.forEach((mid: any) => {
          const s = String(mid || '').trim();
          if (s) mergedIds.add(s);
        });
      }
      groups.push({
        item: {
          ...item,
          ...(mergedIds.size > 0 ? { _mergedIds: Array.from(mergedIds) } : {}),
        },
        semanticType,
        normVideoId,
        normComment,
        actorSet: new Set(actors),
        recipientSet: new Set(recipients),
        mergedIds,
      });
    } else {
      actors.forEach((tok) => existingGroup.actorSet.add(tok));
      recipients.forEach((r) => existingGroup.recipientSet.add(r));
      if (itemId) existingGroup.mergedIds.add(itemId);
      if (Array.isArray(item._mergedIds)) {
        item._mergedIds.forEach((mid: any) => {
          const s = String(mid || '').trim();
          if (s) existingGroup.mergedIds.add(s);
        });
      }
      const prev = existingGroup.item as any;
      const mergedRead = Boolean(prev.read || prev.isRead || item.read || item.isRead);
      const mergedSenderAliases = Array.from(
        new Set([
          ...(Array.isArray(prev.senderAliases) ? prev.senderAliases : []),
          ...(Array.isArray(item.senderAliases) ? item.senderAliases : []),
        ]),
      );
      const mergedRecAliases = Array.from(
        new Set([
          ...(Array.isArray(prev.recipientAliases) ? prev.recipientAliases : []),
          ...(Array.isArray(item.recipientAliases) ? item.recipientAliases : []),
        ]),
      );
      existingGroup.item = {
        ...prev,
        isRead: mergedRead,
        read: mergedRead,
        videoThumbnail: prev.videoThumbnail || item.videoThumbnail || '',
        senderAvatar: prev.senderAvatar || item.senderAvatar || '',
        fromProfilePic: prev.fromProfilePic || item.fromProfilePic || '',
        avatar: prev.avatar || item.avatar || '',
        profilePic: prev.profilePic || item.profilePic || '',
        senderAliases: mergedSenderAliases,
        recipientAliases: mergedRecAliases,
        _mergedIds: Array.from(existingGroup.mergedIds),
      };
    }
  }

  return [...groups.map((g) => g.item), ...passthrough].sort((a, b) => {
    const tA = Date.parse(String(a?.createdAt || '')) || 0;
    const tB = Date.parse(String(b?.createdAt || '')) || 0;
    return tB - tA;
  });
};

const resolveNotificationApiBase = (): string => {
  try {
    const envUrl = (import.meta as any)?.env?.VITE_APP_API_URL;
    if (envUrl && typeof envUrl === 'string' && /^https?:\/\//i.test(envUrl.trim())) {
      return envUrl.trim().replace(/\/+$/, '');
    }
  } catch {}
  return '';
};

const isJsonResponse = (res: Response): boolean => {
  const ct = String(res.headers.get('content-type') || '').toLowerCase();
  return ct.includes('application/json');
};

export const isActorSelf = (senderAliases: string[], recipientAliases: string[]): boolean => {
  const normSenders = senderAliases.map(normalizeId).filter((s) => Boolean(s) && !PLACEHOLDER_NOTIF_KEYS.has(s));
  const normRecipients = recipientAliases.map(normalizeId).filter((r) => Boolean(r) && !PLACEHOLDER_NOTIF_KEYS.has(r));
  return normSenders.some(s => normRecipients.includes(s));
};

const NOTIFICATIONS_COLLECTION = 'notifications';

// Clean legacy global key once on module load so old shared notifications never leak
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('@masti_global_notifications');
  }
} catch {}

/**
 * Creates and stores an isolated notification (synced to shared server + local cache).
 * Returns the created notification, or null if skipped (e.g. self-action or duplicate).
 */
export const createIsolatedNotification = async (params: {
  recipientId: string;
  recipientAliases: string[];
  videoOwnerId?: string;
  senderId: string;
  senderAliases?: string[];
  senderName: string;
  senderAvatar?: string;
  type: 'like' | 'follow' | 'comment' | 'share' | 'save';
  videoId?: string;
  videoThumbnail?: string;
  comment?: string;
  title?: string;
  message?: string;
}): Promise<AppNotification | null> => {
  const {
    recipientId,
    recipientAliases,
    videoOwnerId,
    senderId,
    senderAliases = [senderId],
    senderName,
    senderAvatar = '',
    type,
    videoId = '',
    videoThumbnail = '',
    comment = '',
  } = params;

  const cleanRecipient = normalizeId(recipientId || recipientAliases[0]);
  const allRecipientAliases = Array.from(
    new Set([recipientId, videoOwnerId, ...recipientAliases].map(normalizeId).filter(Boolean))
  );

  const cleanSender = normalizeId(senderId || senderAliases[0]);
  const allSenderAliases = Array.from(
    new Set([senderId, ...senderAliases].map(normalizeId).filter((k) => Boolean(k) && !PLACEHOLDER_NOTIF_KEYS.has(k)))
  );

  // 1. Validate recipient/sender and NEVER allow self or fake/anonymous notifications
  if (allRecipientAliases.length === 0 || allSenderAliases.length === 0) {
    return null;
  }
  if (isActorSelf(allSenderAliases, allRecipientAliases)) {
    return null;
  }

  // 2. Prevent duplicate notifications permanently (even across read/unlike/re-like cycles)
  const candidateNotification = {
    type,
    recipientId: cleanRecipient || allRecipientAliases[0],
    recipientAliases: allRecipientAliases,
    videoOwnerId: videoOwnerId ? String(videoOwnerId) : (cleanRecipient || allRecipientAliases[0]),
    senderId: cleanSender || allSenderAliases[0],
    senderAliases: allSenderAliases,
    senderName,
    videoId: videoId ? String(videoId) : '',
    comment,
  };
  try {
    const existingSnap = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
    const isDbDuplicate = existingSnap.docs.some((d: any) =>
      notificationsMatchSemantically(d.data(), candidateNotification, { matchRecipient: true }),
    );
    if (isDbDuplicate) {
      return null;
    }

    if (typeof localStorage !== 'undefined') {
      for (const alias of allRecipientAliases) {
        const raw = localStorage.getItem(`@masti_notifs_${alias}`);
        if (!raw) continue;
        const cached = JSON.parse(raw);
        if (
          Array.isArray(cached) &&
          cached.some((item: any) =>
            notificationsMatchSemantically(item, candidateNotification, { matchRecipient: true }),
          )
        ) {
          return null;
        }
      }
    }
  } catch (err) {
    console.warn('[Notification] Duplicate check error, proceeding safely:', err);
  }

  // 3. Compose notification
  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const displaySender = senderName || `@${cleanSender}`;

  const defaultTitle =
    type === 'like' ? `${displaySender} liked your video` :
    type === 'follow' ? `${displaySender} started following you` :
    type === 'comment' ? `${displaySender} commented: "${comment.slice(0, 30)}"` :
    type === 'save' ? `${displaySender} saved your video` :
    type === 'share' ? `${displaySender} shared your video` :
    `${displaySender} sent you a notification`;

  const defaultMessage =
    type === 'like' ? 'liked your video' :
    type === 'follow' ? 'started following you' :
    type === 'comment' ? (comment || 'commented on your video') :
    type === 'save' ? 'saved your video' :
    type === 'share' ? 'shared your video' :
    'new activity';

  let notification: AppNotification = {
    notificationId,
    id: notificationId,
    recipientId: cleanRecipient || allRecipientAliases[0],
    recipientAliases: allRecipientAliases,
    videoOwnerId: videoOwnerId ? String(videoOwnerId) : (cleanRecipient || allRecipientAliases[0]),
    senderId: cleanSender || allSenderAliases[0],
    senderAliases: allSenderAliases,
    senderName: displaySender,
    senderAvatar,
    fromUserId: `@${cleanSender || allSenderAliases[0]}`,
    fromUserName: displaySender,
    fromProfilePic: senderAvatar,
    avatar: senderAvatar,
    profilePic: senderAvatar,
    type,
    videoId: videoId ? String(videoId) : '',
    videoThumbnail: videoThumbnail ? String(videoThumbnail) : '',
    createdAt: new Date().toISOString(),
    isRead: false,
    read: false,
    title: params.title || defaultTitle,
    message: params.message || defaultMessage,
    comment,
  };

  // 4. Sync to shared server store so the video owner receives it on ANY device/session
  try {
    const apiBase = resolveNotificationApiBase();
    const res = await fetch(`${apiBase}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notification),
    });
    if (res.ok && isJsonResponse(res)) {
      const data = await res.json();
      if (data?.skippedSelf) {
        return null;
      }
      if (data?.duplicate) {
        return null;
      }
      if (data?.notification) {
        notification = {
          ...notification,
          ...data.notification,
          id: data.notification.id || notification.id,
          notificationId: data.notification.notificationId || notification.notificationId,
        };
      }
    }
  } catch (err) {
    console.warn('[Notification] Server sync failed, storing locally:', err);
  }

  // 5. Save to local database collection
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notification.notificationId);
    await setDoc(docRef, notification);
  } catch (err) {
    console.warn('[Notification] Could not write to db collection:', err);
  }

  // 6. Store in recipient-specific localStorage for instant offline access
  try {
    allRecipientAliases.forEach(alias => {
      const userKey = `@masti_notifs_${alias}`;
      const raw = localStorage.getItem(userKey);
      const userList = raw ? JSON.parse(raw) : [];
      if (!userList.some((n: any) => n.id === notification.id || n.notificationId === notification.notificationId)) {
        userList.unshift(notification);
        localStorage.setItem(userKey, JSON.stringify(userList.slice(0, 100)));
      }
    });
  } catch {}

  // 7. Broadcast event within current window/tabs for live real-time response
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('masti-new-notification', { detail: notification })
      );
    }
  } catch {}

  return notification;
};

/**
 * Fetches notifications strictly addressed to the given user aliases.
 * Merges shared server notifications + local offline store, suppressing self-actions.
 */
export const fetchUserNotifications = async (
  currentUserAliases: string[]
): Promise<AppNotification[]> => {
  const cachedExpanded = getCachedMastiBaseAliases(currentUserAliases);
  const resolvedExpanded = await resolveMastiBaseOwnerAliases([
    ...currentUserAliases,
    ...cachedExpanded,
  ]).catch(() => cachedExpanded);

  const rawQueryAliases: string[] = [];
  const seenRaw = new Set<string>();
  [...currentUserAliases, ...cachedExpanded, ...resolvedExpanded].forEach((raw) => {
    const cleaned = String(raw ?? '').trim().replace(/^@+/, '');
    const norm = cleaned.toLowerCase();
    if (!norm || PLACEHOLDER_NOTIF_KEYS.has(norm) || seenRaw.has(norm)) return;
    seenRaw.add(norm);
    rawQueryAliases.push(cleaned);
  });

  const normUserAliases = Array.from(seenRaw);
  if (normUserAliases.length === 0) return [];

  const normUserSet = new Set(normUserAliases);
  const localReadIds = getLocalReadNotificationIds();
  const localDismissedIds = getLocalDismissedNotificationIds();
  const localDismissedSigs = getLocalDismissedNotificationSignatures();
  const byId = new Map<string, AppNotification>();

  const upsertIfForMe = (rawItem: any, fallbackId?: string) => {
    if (!rawItem || typeof rawItem !== 'object') return;
    const rawType = String(rawItem.type || '').trim().toLowerCase();
    if (rawType === 'chat' || rawType === 'direct_chat_message') return;
    const normalizedType = (rawType === 'bookmark' ? 'save' : (rawType || 'activity')) as AppNotification['type'];

    const notifId = String(rawItem.notificationId || rawItem.id || fallbackId || '').replace(/^fs_/, '');
    if (
      !notifId ||
      localDismissedIds.has(notifId) ||
      isNotificationDismissed({ ...rawItem, id: notifId, notificationId: notifId }, localDismissedIds, localDismissedSigs)
    ) {
      return;
    }

    const recipientKeys = [
      rawItem.recipientId,
      rawItem.videoOwnerId,
      ...(Array.isArray(rawItem.recipientAliases) ? rawItem.recipientAliases : []),
    ]
      .map(normalizeId)
      .filter((k) => Boolean(k) && k !== 'all');
    const isForMe = recipientKeys.some(r => normUserSet.has(r));
    if (!isForMe) return;

    if (!isValidRealNotificationActor(rawItem)) return;

    const senderKeys = [
      rawItem.actorId,
      rawItem.senderId,
      rawItem.fromUserId,
      ...(Array.isArray(rawItem.senderAliases) ? rawItem.senderAliases : []),
    ]
      .map(normalizeId)
      .filter((s) => Boolean(s) && !PLACEHOLDER_NOTIF_KEYS.has(s));
    if (senderKeys.some(s => normUserSet.has(s))) return;

    const existing = byId.get(notifId);
    const mergedRead = Boolean(
      existing?.isRead ||
      existing?.read ||
      rawItem.isRead ||
      rawItem.read ||
      localReadIds.has(notifId),
    );
    byId.set(notifId, {
      ...existing,
      ...rawItem,
      type: normalizedType,
      notificationId: notifId,
      id: notifId,
      isRead: mergedRead,
      read: mergedRead,
    });
  };

  // Prioritize real MastiBase IDs, emails, and UIDs when querying remote MastiBase cloud
  const remoteCandidates = rawQueryAliases
    .filter((a) => !/^user_[a-z0-9]{6,}$/i.test(a) || a.startsWith('usr_'))
    .sort((a, b) => {
      const rank = (v: string) =>
        v.startsWith('usr_') ? 0 : v.includes('@') ? 1 : v.length >= 20 ? 2 : 3;
      return rank(a) - rank(b);
    })
    .slice(0, 6);

  const serverPromise = (async () => {
    try {
      const apiBase = resolveNotificationApiBase();
      const res = await fetch(
        `${apiBase}/api/notifications?aliases=${encodeURIComponent(normUserAliases.join(','))}`,
      );
      if (res.ok && isJsonResponse(res)) {
        const data = await res.json();
        if (Array.isArray(data?.notifications)) {
          data.notifications.forEach((n: any) => upsertIfForMe(n));
        }
      }
    } catch (err) {
      console.warn('[Notification] Could not fetch from server:', err);
    }
  })();

  const mastiBasePromise = Promise.all(
    remoteCandidates.map(async (alias) => {
      try {
        const remoteNotifs = await getMastiBaseNotifications(alias);
        remoteNotifs.forEach((n: any) => upsertIfForMe(n));
      } catch {}
    }),
  );

  const localDbPromise = (async () => {
    try {
      const snap = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
      snap.docs.forEach((d: any) => {
        upsertIfForMe(d.data(), d.id);
      });
    } catch (err) {
      console.warn('[Notification] Could not fetch from database:', err);
    }
  })();

  await Promise.all([serverPromise, mastiBasePromise, localDbPromise]);

  // 4. Fetch from recipient-specific offline cache
  try {
    for (const alias of normUserAliases) {
      const userKey = `@masti_notifs_${alias}`;
      const raw = localStorage.getItem(userKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached)) {
          cached.forEach((item: any) => {
            const enriched = (item && !item.recipientId && !(Array.isArray(item.recipientAliases) && item.recipientAliases.length > 0))
              ? { ...item, recipientId: alias, recipientAliases: [alias] }
              : item;
            upsertIfForMe(enriched);
          });
        }
      }
    }
  } catch {}

  const list = dedupeNotificationsSemantic(Array.from(byId.values()));
  return list;
};

/**
 * Subscribes to real-time notification push via Server-Sent Events.
 */
export const subscribeToNotificationStream = (
  currentUserAliases: string[],
  onNotification: (notification: AppNotification) => void
): (() => void) => {
  const expandedAliases = [...currentUserAliases, ...getCachedMastiBaseAliases(currentUserAliases)];
  const normAliases = Array.from(
    new Set(expandedAliases.map(normalizeId).filter((k) => Boolean(k) && !PLACEHOLDER_NOTIF_KEYS.has(k))),
  );
  if (normAliases.length === 0 || typeof window === 'undefined' || !window.EventSource) {
    return () => {};
  }
  const normSet = new Set(normAliases);

  try {
    const apiBase = resolveNotificationApiBase();
    const es = new EventSource(`${apiBase}/api/notifications/stream?aliases=${encodeURIComponent(normAliases.join(','))}`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'new_notification' && data.notification) {
          const n = data.notification;
          if (!isValidRealNotificationActor(n) || isNotificationDismissed(n)) return;
          const senderKeys = [
            n.actorId,
            n.senderId,
            n.fromUserId,
            ...(Array.isArray(n.senderAliases) ? n.senderAliases : []),
          ].map(normalizeId).filter((s) => Boolean(s) && !PLACEHOLDER_NOTIF_KEYS.has(s));
          if (senderKeys.some(s => normSet.has(s))) return;
          onNotification(n);
        }
      } catch {}
    };
    es.onerror = () => {
      // EventSource reconnects automatically
    };
    return () => {
      es.close();
    };
  } catch {
    return () => {};
  }
};

/**
 * Computes unread notification counts for the given user.
 * Counts ONLY unread notifications.
 */
export const countUserUnreadNotifications = async (
  currentUserAliases: string[]
): Promise<{ total: number; likes: number; follows: number; comments: number }> => {
  const notifs = await fetchUserNotifications(currentUserAliases);
  const counts = { total: 0, likes: 0, follows: 0, comments: 0 };

  notifs.forEach(n => {
    if (n.isRead || n.read || !isValidRealNotificationActor(n)) return;
    counts.total += 1;
    if (n.type === 'like') counts.likes += 1;
    else if (n.type === 'follow') counts.follows += 1;
    else if (n.type === 'comment') counts.comments += 1;
  });

  return counts;
};

/**
 * Marks notifications for the given user as read on server, database, and local storage immediately.
 */
export const markUserNotificationsAsRead = async (
  currentUserAliases: string[],
  notificationIds?: string[]
): Promise<void> => {
  const expandedAliases = [...currentUserAliases, ...getCachedMastiBaseAliases(currentUserAliases)];
  const normUserAliases = Array.from(
    new Set(expandedAliases.map(normalizeId).filter((k) => Boolean(k) && !PLACEHOLDER_NOTIF_KEYS.has(k))),
  );
  if (normUserAliases.length === 0) return;

  if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    markLocalReadNotificationIds(notificationIds);
  }

  const targetIds = notificationIds && notificationIds.length > 0 ? new Set(notificationIds) : null;

  // 1. Update on shared server
  try {
    const apiBase = resolveNotificationApiBase();
    await fetch(`${apiBase}/api/notifications/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aliases: normUserAliases,
        notificationIds: notificationIds || [],
      }),
    });
  } catch (err) {
    console.warn('[Notification] Could not update server read status:', err);
  }

  // 2. Update in local Database
  try {
    const snap = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
    for (const d of snap.docs) {
      const data = d.data();
      const notifId = data.notificationId || data.id || d.id;
      if (targetIds && !targetIds.has(notifId)) continue;

      const normRec = normalizeId(data.recipientId);
      const aliases = Array.isArray(data.recipientAliases)
        ? data.recipientAliases.map(normalizeId)
        : [];
      const isForMe = normUserAliases.includes(normRec) || aliases.some((a: string) => normUserAliases.includes(a));

      if (isForMe && (!data.isRead || !data.read)) {
        await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, d.id), {
          isRead: true,
          read: true,
        });
      }
    }
  } catch (err) {
    console.warn('[Notification] Could not update database read status:', err);
  }

  // 3. Update user localStorage cache
  try {
    for (const alias of normUserAliases) {
      const userKey = `@masti_notifs_${alias}`;
      const raw = localStorage.getItem(userKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached)) {
          const updated = cached.map((item: any) => {
            const notifId = item.notificationId || item.id;
            if (!targetIds || targetIds.has(notifId)) {
              return { ...item, isRead: true, read: true };
            }
            return item;
          });
          localStorage.setItem(userKey, JSON.stringify(updated));
        }
      }
    }
  } catch {}
};

/**
 * Permanently dismisses/removes selected notifications from server, database, local storage caches, and MastiBase Cloud.
 */
export const dismissUserNotifications = async (
  currentUserAliases: string[],
  notificationIds: string[],
  options?: {
    dismissedItems?: any[];
    remainingNotifications?: any[];
  },
): Promise<void> => {
  const dismissedItems = Array.isArray(options?.dismissedItems) ? options!.dismissedItems : [];
  const cleanIds = Array.from(
    new Set(
      [
        ...(notificationIds || []),
        ...dismissedItems.flatMap((it) => [
          it?.notificationId,
          it?.id,
          ...(Array.isArray(it?._mergedIds) ? it._mergedIds : []),
        ]),
      ]
        .map((id) => String(id || '').trim().replace(/^fs_/, ''))
        .filter(Boolean),
    ),
  );
  if (cleanIds.length === 0 && dismissedItems.length === 0) return;

  if (cleanIds.length > 0) {
    markLocalDismissedNotificationIds(cleanIds);
  }
  if (dismissedItems.length > 0) {
    markLocalDismissedNotificationSignatures(dismissedItems);
  }

  const expandedAliases = [...currentUserAliases, ...getCachedMastiBaseAliases(currentUserAliases)];
  const resolvedExpanded = await resolveMastiBaseOwnerAliases(expandedAliases).catch(() => expandedAliases);
  const normUserAliases = Array.from(
    new Set(
      [...expandedAliases, ...resolvedExpanded]
        .map(normalizeId)
        .filter((k) => Boolean(k) && !PLACEHOLDER_NOTIF_KEYS.has(k)),
    ),
  );
  const idSet = new Set(cleanIds);
  const dismissedIdsNow = getLocalDismissedNotificationIds();
  const dismissedSigsNow = getLocalDismissedNotificationSignatures();

  const matchesDismissed = (item: any, docId?: string): boolean => {
    if (!item || typeof item !== 'object') return false;
    const nid = String(item.notificationId || item.id || docId || '').replace(/^fs_/, '');
    if (nid && (idSet.has(nid) || (docId && idSet.has(String(docId))))) return true;
    if (isNotificationDismissed(item, dismissedIdsNow, dismissedSigsNow)) return true;
    return dismissedItems.some((d) => notificationsMatchSemantically(item, d));
  };

  const remainingSafe = Array.isArray(options?.remainingNotifications)
    ? options!.remainingNotifications
        .filter((item) => item && !matchesDismissed(item))
        .map((item) => {
          const cleanId = String(item.notificationId || item.id || '').trim().replace(/^fs_/, '');
          return cleanId ? { ...item, id: cleanId, notificationId: cleanId } : item;
        })
    : [];

  // Preserve remaining non-dismissed notifications before clearing MastiBase remote user inbox
  if (remainingSafe.length > 0 && normUserAliases.length > 0) {
    preserveMastiBaseNotificationsLocally(normUserAliases, remainingSafe);
    try {
      const apiBase = resolveNotificationApiBase();
      await fetch(`${apiBase}/api/notifications/preserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: remainingSafe }),
      }).catch(() => {});
    } catch {}
    for (const rem of remainingSafe) {
      const remId = String(rem.notificationId || rem.id || '').trim();
      if (!remId) continue;
      try {
        await setDoc(doc(db, NOTIFICATIONS_COLLECTION, remId), rem);
      } catch {}
    }
  }

  // Delete matching docs from local Database collection (by ID OR semantic match)
  try {
    const snap = await getDocs(collection(db, NOTIFICATIONS_COLLECTION));
    for (const d of snap.docs) {
      const data = d.data();
      if (matchesDismissed(data, d.id)) {
        await deleteDoc(doc(db, NOTIFICATIONS_COLLECTION, d.id)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Notification] Could not delete from local database:', err);
  }

  // Remove dismissed items from every @masti_notifs_* localStorage cache
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('@masti_notifs_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached)) {
            const filtered = cached.filter((item: any) => !matchesDismissed(item));
            if (filtered.length !== cached.length) {
              localStorage.setItem(key, JSON.stringify(filtered));
            }
          }
        } catch {}
      }
    }
  } catch {}

  // Dismiss permanently on Express server (persisted IDs + semantic signatures)
  try {
    const apiBase = resolveNotificationApiBase();
    await fetch(`${apiBase}/api/notifications/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aliases: normUserAliases,
        notificationIds: cleanIds,
        dismissedItems,
      }),
    });
  } catch (err) {
    console.warn('[Notification] Could not dismiss on server:', err);
  }

  // Delete permanently on MastiBase Cloud API
  try {
    await deleteMastiBaseNotifications(
      [...currentUserAliases, ...normUserAliases],
      cleanIds,
      dismissedItems,
      remainingSafe,
    );
  } catch (err) {
    console.warn('[Notification] Could not delete on MastiBase:', err);
  }
};
