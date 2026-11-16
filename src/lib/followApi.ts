import { collection, deleteDoc, doc, getDocs, setDoc } from './localStore';

const normKey = (v: any): string =>
  String(v ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();

export async function sanitizeLocalFollowsCollection(db: any, ownerIdentities: string[]) {
  try {
    const ownerSet = new Set((ownerIdentities ?? []).map(normKey).filter(Boolean));
    const snap = await getDocs(collection(db, 'follows'));
    const bestByPair = new Map<string, { id: string; score: number; data: any }>();
    const deleteIds: string[] = [];

    snap.docs.forEach((docSnap: any) => {
      const id = String(docSnap?.id || '');
      const data = typeof docSnap?.data === 'function' ? docSnap.data() : docSnap;
      if (!data || typeof data !== 'object') {
        if (id) deleteIds.push(id);
        return;
      }

      const fKeys = [
        data.followerUserId,
        data.followerId,
        data.followerEmail,
        data.followerUid,
        ...(Array.isArray(data.followerAliases) ? data.followerAliases : []),
      ]
        .map(normKey)
        .filter(Boolean);

      const tKeys = [
        data.followeeId,
        data.followeeBackendId,
        data.followeeEmail,
        ...(Array.isArray(data.followeeAliases) ? data.followeeAliases : []),
      ]
        .map(normKey)
        .filter(Boolean);

      if (
        fKeys.length === 0 ||
        tKeys.length === 0 ||
        fKeys.some((fk) => tKeys.includes(fk)) ||
        (ownerSet.size > 0 && fKeys.some((fk) => ownerSet.has(fk)) && tKeys.some((tk) => ownerSet.has(tk)))
      ) {
        if (id) deleteIds.push(id);
        return;
      }

      const canonicalPair = `${fKeys[0]}__${tKeys[0]}`;
      const score =
        (id === canonicalPair ? 8 : 0) +
        (id.includes('__') ? 4 : 0) +
        (data.followerPic ? 2 : 0) +
        (data.followeeName ? 1 : 0);

      const existing = bestByPair.get(canonicalPair);
      if (!existing) {
        bestByPair.set(canonicalPair, { id, score, data });
      } else if (score > existing.score) {
        if (existing.id) deleteIds.push(existing.id);
        bestByPair.set(canonicalPair, { id, score, data });
      } else if (id) {
        deleteIds.push(id);
      }
    });

    if (deleteIds.length > 0) {
      await Promise.all(deleteIds.map((dupId) => deleteDoc(doc(db, 'follows', dupId)).catch(() => {})));
    }
    return Array.from(bestByPair.values()).map((e) => e.data);
  } catch {
    return [];
  }
}

export async function fetchServerFollows(identities: string[]) {
  const clean = Array.from(new Set(identities.map(normKey).filter(Boolean)));
  if (clean.length === 0) return null;
  try {
    const res = await fetch(`/api/follows?identities=${encodeURIComponent(clean.join(','))}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.success) {
      return {
        followers: Array.isArray(data.followers) ? data.followers : [],
        following: Array.isArray(data.following) ? data.following : [],
      };
    }
  } catch (err) {
    console.warn('[FollowAPI] Could not fetch server follows:', err);
  }
  return null;
}

export async function syncServerFollow(payload: any): Promise<boolean> {
  try {
    const res = await fetch('/api/follows/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.warn('[FollowAPI] Could not sync follow to server:', err);
    return false;
  }
}

export async function migrateLocalFollowsToServer(records: any[]) {
  if (!Array.isArray(records) || records.length === 0) return;
  try {
    await fetch('/api/follows/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
  } catch {}
}

export async function hydrateFollowsIntoLocalStore(db: any, records: any[], ownerIdentities?: string[]) {
  if (!Array.isArray(records) || records.length === 0) return;
  const ownerSet = new Set((ownerIdentities ?? []).map(normKey).filter(Boolean));
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    const fKey = normKey(rec.followerUserId || rec.followerId || rec.followerEmail);
    const tKey = normKey(rec.followeeId || rec.followeeBackendId || rec.followeeEmail);
    if (!fKey || !tKey || fKey === tKey) continue;
    if (ownerSet.size > 0 && ownerSet.has(fKey) && ownerSet.has(tKey)) continue;
    await setDoc(doc(db, 'follows', `${fKey}__${tKey}`), rec, { merge: true }).catch(() => {});
  }
}

export async function migrateFollowOwnerIdentity(db: any, params: any) {
  const cleanHandle = String(params?.newHandle || '').trim();
  if (!normKey(cleanHandle)) return;
  const handleWithAt = cleanHandle.startsWith('@') ? cleanHandle : `@${cleanHandle}`;
  const ownerAliasSet = new Set(
    [...(params?.oldIdentities || []), params?.uid, params?.email, params?.mastiBaseUserId, handleWithAt]
      .map(normKey)
      .filter(Boolean),
  );
  const mergedAliases = Array.from(ownerAliasSet);

  try {
    const snap = await getDocs(collection(db, 'follows'));
    for (const docSnap of snap.docs) {
      const id = String(docSnap?.id || '');
      const data = typeof docSnap?.data === 'function' ? docSnap.data() : docSnap;
      if (!data || typeof data !== 'object') continue;

      const fKeys = [
        data.followerUserId,
        data.followerId,
        data.followerEmail,
        data.followerUid,
        ...(Array.isArray(data.followerAliases) ? data.followerAliases : []),
      ]
        .map(normKey)
        .filter(Boolean);

      const tKeys = [
        data.followeeId,
        data.followeeBackendId,
        data.followeeEmail,
        ...(Array.isArray(data.followeeAliases) ? data.followeeAliases : []),
      ]
        .map(normKey)
        .filter(Boolean);

      const isFollowerOwner = fKeys.some((k) => ownerAliasSet.has(k));
      const isFolloweeOwner = tKeys.some((k) => ownerAliasSet.has(k));
      if (!isFollowerOwner && !isFolloweeOwner) continue;
      if (isFollowerOwner && isFolloweeOwner) {
        if (id) await deleteDoc(doc(db, 'follows', id)).catch(() => {});
        continue;
      }

      const nextData = { ...data };
      if (isFollowerOwner) {
        nextData.followerId = handleWithAt;
        nextData.followerUserId = handleWithAt;
        if (params.newName) nextData.followerName = params.newName;
        if (params.newAvatar) nextData.followerPic = params.newAvatar;
        if (params.uid) nextData.followerUid = params.uid;
        if (params.email) nextData.followerEmail = params.email;
        nextData.followerAliases = Array.from(new Set([...fKeys, ...mergedAliases]));
      }
      if (isFolloweeOwner) {
        nextData.followeeId = handleWithAt;
        if (params.newName) nextData.followeeName = params.newName;
        if (params.newAvatar) nextData.followeePic = params.newAvatar;
        if (params.mastiBaseUserId) nextData.followeeBackendId = params.mastiBaseUserId;
        if (params.email) nextData.followeeEmail = params.email;
        nextData.followeeAliases = Array.from(new Set([...tKeys, ...mergedAliases]));
      }

      const nextFKey = normKey(nextData.followerUserId || nextData.followerId);
      const nextTKey = normKey(nextData.followeeId || nextData.followeeBackendId);
      const nextDocId = nextFKey && nextTKey ? `${nextFKey}__${nextTKey}` : id;
      if (nextDocId && nextDocId !== id && id) await deleteDoc(doc(db, 'follows', id)).catch(() => {});
      if (nextDocId) await setDoc(doc(db, 'follows', nextDocId), nextData, { merge: true }).catch(() => {});
    }
  } catch (err) {
    console.warn('[FollowAPI] Local follow owner migration error:', err);
  }

  try {
    await fetch('/api/follows/rename-owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldIdentities: mergedAliases,
        uid: params?.uid,
        email: params?.email,
        mastiBaseUserId: params?.mastiBaseUserId,
        newHandle: handleWithAt,
        newName: params?.newName,
        newAvatar: params?.newAvatar,
      }),
    });
  } catch {}
}
