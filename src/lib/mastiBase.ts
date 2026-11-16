export interface MastiBaseRemoteTheme {
  iconStyle?: string;
  fontFamily?: string;
  isDarkMode?: boolean;
  layoutType?: string;
  borderRadius?: number;
  cameraEngine?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface MastiBaseAdsConfig {
  enabled: boolean;
  globalAdsEnabled: boolean;
  testAdsEnabled: boolean;
  appId: string;
  bannerAdUnitId: string;
  interstitialAdUnitId: string;
  rewardedAdUnitId: string;
  nativeAdUnitId: string;
  adFrequency: number;
  bannerFrequency: number;
  interstitialFrequency: number;
  isUploadAllowed: boolean;
  isMaintenanceMode: boolean;
  isVerificationEnabled: boolean;
  announcementText: string;
  theme?: MastiBaseRemoteTheme;
  updatedAt?: string;
}

const API_BASE = 'https://masti-basen.lovable.app';
const API_KEY = 'mb_live_rajkali_8789_7b31a6fe89d24643';

const apiHeaders = (extra: Record<string, string> = {}) => ({
  'x-api-key': API_KEY,
  'Content-Type': 'application/json',
  ...extra,
});

export const normalizeMastiAvatarUrl = (url: any): string => {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/dicebear|bottts|robohash|avatar\.iran\.liara\.run|images\.unsplash\.com\/photo-1534528741775/i.test(trimmed)) {
    return '';
  }
  return trimmed;
};

export const normalizeMastiMediaUrl = (url: any): string => {
  if (!url) return '';
  return String(url).trim();
};

export const normalizeMastiBaseActionResponse = (res: any) => {
  return res || { success: true };
};

export const parseMastiBaseVerifiedFlag = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    return clean === 'true' || clean === '1' || clean === 'yes' || clean === 'verified';
  }
  return false;
};

// ── Live MastiBase Cloud API Integration ──

const VIDEO_SONG_META_STORAGE_KEY = '@masti_video_songs_v1';

export interface VideoSongMetadataEntry {
  song: any;
  musicVol?: number;
  originalSoundVol?: number;
  updatedAt?: string;
}

export const getLocalVideoSongMetadataMap = (): Record<string, VideoSongMetadataEntry> => {
  try {
    const raw = localStorage.getItem(VIDEO_SONG_META_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const saveLocalVideoSongMetadata = (
  keys: Array<string | undefined | null>,
  entry: VideoSongMetadataEntry,
) => {
  try {
    const current = getLocalVideoSongMetadataMap();
    const record: VideoSongMetadataEntry = {
      ...entry,
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
    for (const rawKey of keys) {
      const k = String(rawKey || '').trim();
      if (!k) continue;
      current[k] = record;
      const cleanId = k.replace(/^db-/, '');
      if (cleanId && cleanId !== k) {
        current[cleanId] = record;
      } else if (k && !k.startsWith('http') && !k.startsWith('db-')) {
        current[`db-${k}`] = record;
      }
      if (k.startsWith('http')) {
        current[k.split('?')[0]] = record;
      }
    }
    localStorage.setItem(VIDEO_SONG_META_STORAGE_KEY, JSON.stringify(current));
    return current;
  } catch {
    return getLocalVideoSongMetadataMap();
  }
};

export const fetchServerVideoSongMetadata = async (): Promise<Record<string, VideoSongMetadataEntry>> => {
  try {
    const res = await fetch('/api/videos/song-metadata');
    if (!res.ok) return {};
    const data = await res.json();
    const map = data?.metadata;
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      const merged = { ...map, ...getLocalVideoSongMetadataMap() };
      try {
        localStorage.setItem(VIDEO_SONG_META_STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch {}
  return getLocalVideoSongMetadataMap();
};

export const syncVideoSongMetadataToServer = async (params: {
  videoId?: string | null;
  videoUrl?: string | null;
  song: any;
  musicVol?: number;
  originalSoundVol?: number;
}) => {
  const { videoId, videoUrl, song, musicVol, originalSoundVol } = params;
  if (!song || typeof song !== 'object') return;
  saveLocalVideoSongMetadata([videoId, videoUrl], {
    song,
    musicVol,
    originalSoundVol,
  });
  try {
    await fetch('/api/videos/song-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId,
        videoUrl,
        song,
        musicVol,
        originalSoundVol,
      }),
    });
  } catch {}
};

export const findSavedSongMetadataForItem = (
  item: any,
  songMetaMap: Record<string, VideoSongMetadataEntry>,
): VideoSongMetadataEntry | null => {
  if (!item || !songMetaMap) return null;
  const idStr = String(item.id || '').trim();
  const cleanId = idStr.replace(/^db-/, '');
  const urlStr = String(item.videoUrl || item.url || item.mediaUrl || '').trim();
  const candidates = [
    idStr,
    cleanId,
    cleanId ? `db-${cleanId}` : '',
    urlStr,
    urlStr ? urlStr.split('?')[0] : '',
  ].filter(Boolean);
  for (const key of candidates) {
    const found = songMetaMap[key];
    if (found?.song) return found;
  }
  return null;
};

const isOriginalPlaceholderTitle = (title?: string) => {
  const t = String(title || '').trim().toLowerCase();
  return !t || t === 'original audio' || t === 'original sound';
};

const isCustomOrAttachedSong = (song: any, videoId?: string) => {
  if (!song || typeof song !== 'object') return false;
  if (song.title && !isOriginalPlaceholderTitle(song.title)) return true;
  const audio = song.audioUrl || song.url;
  if (audio) {
    const cleanVid = String(videoId || '').replace(/^db-/, '');
    const sid = String(song.id || '');
    if (!sid || (sid !== `original-${cleanVid}` && sid !== `original_${cleanVid}` && sid !== `original-${videoId}`)) {
      return true;
    }
  }
  return false;
};

const DELETED_VIDEO_IDS_STORAGE_KEY = '@masti_deleted_video_ids_global';

export const getLocalDeletedVideoIdsMap = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(DELETED_VIDEO_IDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const isDeletedVideoRecord = (
  item: any,
  deletedMap: Record<string, boolean>,
): boolean => {
  if (!item || !deletedMap) return false;
  const idCandidates = [item.id, item.mediaId, item.videoId]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  for (const rawId of idCandidates) {
    const cleanId = rawId.replace(/^db-/, '');
    if (
      deletedMap[rawId] ||
      (cleanId && deletedMap[cleanId]) ||
      (cleanId && deletedMap[`db-${cleanId}`])
    ) {
      return true;
    }
  }
  const urlCandidates = [item.videoUrl, item.url, item.mediaUrl]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  for (const rawUrl of urlCandidates) {
    const noQuery = rawUrl.split('?')[0];
    if (deletedMap[rawUrl] || (noQuery && deletedMap[noQuery])) {
      return true;
    }
  }
  return false;
};

export const saveLocalDeletedVideoIds = (keys: Array<string | undefined | null>) => {
  try {
    const current = getLocalDeletedVideoIdsMap();
    for (const rawKey of keys) {
      const k = String(rawKey || '').trim();
      if (!k) continue;
      current[k] = true;
      if (!k.startsWith('http')) {
        const cleanId = k.replace(/^db-/, '');
        if (cleanId) {
          current[cleanId] = true;
          current[`db-${cleanId}`] = true;
        }
      } else {
        current[k.split('?')[0]] = true;
      }
    }
    localStorage.setItem(DELETED_VIDEO_IDS_STORAGE_KEY, JSON.stringify(current));

    try {
      const cachedFeedRaw = localStorage.getItem('@masti_media_videos_v3');
      if (cachedFeedRaw) {
        const parsed = JSON.parse(cachedFeedRaw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((item: any) => !isDeletedVideoRecord(item, current));
          localStorage.setItem('@masti_media_videos_v3', JSON.stringify(filtered));
        }
      }
    } catch {}

    return current;
  } catch {
    return getLocalDeletedVideoIdsMap();
  }
};

export const fetchServerDeletedVideoIds = async (): Promise<Record<string, boolean>> => {
  const localMap = getLocalDeletedVideoIdsMap();
  try {
    const res = await fetch('/api/videos/deleted');
    if (!res.ok) return localMap;
    const data = await res.json();
    const serverMap = data?.deletedIds;
    if (serverMap && typeof serverMap === 'object' && !Array.isArray(serverMap)) {
      const merged = { ...serverMap, ...localMap };
      try {
        localStorage.setItem(DELETED_VIDEO_IDS_STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch {}
  return localMap;
};

export const getMastiBaseFeed = async (page = 1, limit = 20, viewerId?: string) => {
  const isNonVideoAsset = (item: any) => {
    const title = String(item?.title || '').trim().toLowerCase();
    const caption = String(item?.caption || item?.description || item?.desc || '').trim().toLowerCase();
    const tags = Array.isArray(item?.hashtags) ? item.hashtags.map((t: any) => String(t).toLowerCase()) : [];
    const rawUrl = String(item?.videoUrl || item?.url || item?.mediaUrl || '').split('?')[0].toLowerCase();
    const isImageUrl = /\.(jpe?g|png|webp|gif|bmp|svg|heic|heif)$/.test(rawUrl);
    const isHelperTag =
      /#(thumbnail|avatar|dp|profile)\b/.test(caption) ||
      tags.includes('thumbnail') ||
      tags.includes('avatar') ||
      tags.includes('dp') ||
      title === 'video thumbnail' ||
      title.startsWith('avatar -');
    if (item?.mediaType === 'image') return true;
    if (isHelperTag && (isImageUrl || !/\.(mp4|mov|m4v|webm|m3u8)$/.test(rawUrl))) return true;
    if (isImageUrl && !/\.(mp4|mov|m4v|webm|m3u8)$/.test(String(item?.streamUrl || '').toLowerCase())) return true;
    return false;
  };

  const viewerParam = viewerId ? `&viewerId=${encodeURIComponent(String(viewerId).trim())}` : '';
  const serverMetaPromise = fetchServerVideoSongMetadata().catch(() => getLocalVideoSongMetadataMap());
  const deletedMapPromise = fetchServerDeletedVideoIds().catch(() => getLocalDeletedVideoIdsMap());
  try {
    let res: Response | null = null;
    try {
      res = await fetch(`${API_BASE}/api/videos/feed?page=${page}&limit=${limit}${viewerParam}`, {
        headers: apiHeaders(),
      });
    } catch {
      // Fallback to local server proxy
      res = await fetch(`/api/videos/feed?page=${page}&limit=${limit}${viewerParam}`).catch(() => null);
    }

    if (!res || !res.ok) {
      try {
        res = await fetch(`/api/videos/feed?page=${page}&limit=${limit}${viewerParam}`).catch(() => null);
      } catch {}
    }

    const [data, songMetaMap, deletedMap] = await Promise.all([
      res && res.ok ? res.json() : Promise.resolve(null),
      serverMetaPromise,
      deletedMapPromise,
    ]);
    const rawList = data?.data || data?.videos || data?.items || (Array.isArray(data) ? data : []);
    if (Array.isArray(rawList) && rawList.length > 0) {
      const mappedVideos = rawList
        .filter((item: any) => !isNonVideoAsset(item) && !isDeletedVideoRecord(item, deletedMap))
        .map((item: any) => {
          const videoUrl = item.videoUrl || item.url || item.mediaUrl || '';
          const thumbnailUrl = item.thumbnailUrl || item.thumbnail || videoUrl;
          const profile = item.profile || {};
          const social = item.social || {};
          const cleanProfileAvatar = normalizeMastiAvatarUrl(
            /images\.unsplash\.com\/photo-1534528741775/i.test(String(profile.avatarUrl || ''))
              ? ''
              : profile.avatarUrl,
          );
          const profileNameStr = String(profile.name || '').trim();
          const handleFromProfile =
            (profileNameStr.startsWith('@') ? profileNameStr : '') ||
            (profile.username && !/^user$/i.test(String(profile.username).trim()) ? profile.username : '') ||
            profileNameStr ||
            profile.username ||
            'creator';

          const savedMeta = findSavedSongMetadataForItem(item, songMetaMap);
          const musicAudioUrl = item.music?.audioUrl || item.music?.url || item.audioUrl || '';
          const hasRemoteMusicTrack =
            Boolean(musicAudioUrl) ||
            (Boolean(item.music?.title) && !isOriginalPlaceholderTitle(item.music?.title));
          const backendSong =
            isCustomOrAttachedSong(item.song, item.id)
              ? item.song
              : hasRemoteMusicTrack
                ? {
                    id: item.music?.id || item.songId || 'song_' + item.id,
                    title: !isOriginalPlaceholderTitle(item.music?.title)
                      ? item.music.title
                      : (item.songTitle || 'Music'),
                    artist: item.music?.artist || item.songArtist || profileNameStr || 'Masti Creator',
                    cover: item.music?.cover || item.songCover || cleanProfileAvatar,
                    audioUrl: musicAudioUrl || undefined,
                    trimStart: item.music?.trimStart,
                    trimEnd: item.music?.trimEnd,
                    audioMuxedInVideo: Boolean(item.music?.audioMuxedInVideo),
                  }
                : item.songTitle
                  ? {
                      id: item.songId || 'song_' + item.id,
                      title: item.songTitle,
                      artist: item.songArtist || profileNameStr || 'Masti Creator',
                      cover: item.songCover || cleanProfileAvatar,
                      audioUrl: item.audioUrl,
                    }
                  : null;
          const resolvedSong =
            (savedMeta?.song && isCustomOrAttachedSong(savedMeta.song, item.id) ? savedMeta.song : null) ||
            backendSong || {
              id: 'original_' + item.id,
              title: 'Original Audio',
              artist: profileNameStr || 'Masti Creator',
              cover: cleanProfileAvatar,
              isOriginal: true,
            };
          const resolvedMusicCover =
            isCustomOrAttachedSong(resolvedSong, item.id) && resolvedSong.cover
              ? resolvedSong.cover
              : (cleanProfileAvatar || resolvedSong.cover || '');

          return {
            ...item,
            id: String(item.id || 'v_' + Math.random().toString(36).substring(2, 9)),
            url: videoUrl,
            videoUrl: videoUrl,
            thumbnailUrl: thumbnailUrl,
            title: item.title || item.caption || 'Masti Video',
            desc: item.caption || item.description || item.title || '',
            likes: Number(social.likes ?? item.likesCount ?? item.likes ?? 0),
            comments: Number(social.comments ?? item.commentsCount ?? item.comments ?? 0),
            shares: Number(social.shares ?? item.sharesCount ?? item.shares ?? 0),
            saves: Number(social.saves ?? item.savesCount ?? item.saves ?? 0),
            views: Number(social.views ?? item.viewsCount ?? item.views ?? 0),
            isLiked: Boolean(social.isLiked || item.isLiked),
            isSaved: Boolean(social.isSaved || item.isSaved),
            isBookmarked: Boolean(social.isBookmarked || item.isBookmarked),
            isFollowing: Boolean(social.isFollowing || item.isFollowing),
            isFollowingCreator: Boolean(social.isFollowingCreator || item.isFollowingCreator),
            user: handleFromProfile,
            userId: profile.id || profile.firebaseUid || item.userId || 'creator',
            backendUserId: item.userId || profile.id || undefined,
            firebaseUid: item.firebaseUid || profile.firebaseUid || undefined,
            ownerEmail: item.ownerEmail || profile.email || undefined,
            name: profileNameStr || 'Masti Creator',
            profileImage: cleanProfileAvatar,
            isVerified: parseMastiBaseVerifiedFlag(profile.isVerified ?? item.isVerified),
            musicCover: resolvedMusicCover,
            musicVol: savedMeta?.musicVol ?? item.musicVol,
            originalSoundVol: savedMeta?.originalSoundVol ?? item.originalSoundVol,
            profile: {
              ...profile,
              avatarUrl: cleanProfileAvatar,
              name: profileNameStr || 'Masti Creator',
              username: handleFromProfile.replace(/^@+/, '') || 'creator',
              isVerified: parseMastiBaseVerifiedFlag(profile.isVerified ?? item.isVerified),
            },
            social: {
              ...social,
              likes: Number(social.likes ?? item.likesCount ?? item.likes ?? 0),
              comments: Number(social.comments ?? item.commentsCount ?? item.comments ?? 0),
              shares: Number(social.shares ?? item.sharesCount ?? item.shares ?? 0),
              saves: Number(social.saves ?? item.savesCount ?? item.saves ?? 0),
              isLiked: Boolean(social.isLiked || item.isLiked),
              isBookmarked: Boolean(social.isBookmarked || item.isBookmarked),
              isFollowingCreator: Boolean(social.isFollowingCreator || item.isFollowingCreator),
            },
            song: resolvedSong,
            qualities: item.qualities || [],
            qualityUrls: item.qualityUrls || { auto: videoUrl },
            createdAt: item.createdAt || new Date().toISOString(),
          };
        });

      try {
        localStorage.setItem('@masti_media_videos_v3', JSON.stringify(mappedVideos));
      } catch {}

      const result: any = mappedVideos;
      result.videos = mappedVideos;
      result.page = page;
      result.hasMore = mappedVideos.length >= limit;
      return result;
    }
  } catch (err) {
    console.warn('[MastiBase API] Could not fetch live feed, using cache:', err);
  }

  try {
    const saved = localStorage.getItem('@masti_media_videos_v3');
    if (saved) {
      const parsed = JSON.parse(saved);
      const songMetaMap = getLocalVideoSongMetadataMap();
      const deletedMap = getLocalDeletedVideoIdsMap();
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed
          .filter((item: any) => !isNonVideoAsset(item) && !isDeletedVideoRecord(item, deletedMap))
          .map((item: any) => {
            const cleanAvatar = normalizeMastiAvatarUrl(
              /images\.unsplash\.com\/photo-1534528741775/i.test(String(item?.profileImage || item?.profile?.avatarUrl || ''))
                ? ''
                : (item?.profileImage || item?.profile?.avatarUrl || ''),
            );
            const savedMeta = findSavedSongMetadataForItem(item, songMetaMap);
            const resolvedSong =
              (savedMeta?.song && isCustomOrAttachedSong(savedMeta.song, item.id) ? savedMeta.song : null) ||
              item?.song;
            const hasSongCover = isCustomOrAttachedSong(resolvedSong, item.id) && resolvedSong?.cover;
            return {
              ...item,
              profileImage: cleanAvatar,
              song: resolvedSong || item?.song,
              musicCover: hasSongCover ? resolvedSong.cover : (item?.musicCover || cleanAvatar || ''),
              musicVol: savedMeta?.musicVol ?? item?.musicVol,
              originalSoundVol: savedMeta?.originalSoundVol ?? item?.originalSoundVol,
              profile: item?.profile
                ? { ...item.profile, avatarUrl: cleanAvatar }
                : item?.profile,
            };
          });
        try {
          if (cleaned.length !== parsed.length) {
            localStorage.setItem('@masti_media_videos_v3', JSON.stringify(cleaned));
          }
        } catch {}
        if (cleaned.length > 0) {
          const result: any = cleaned;
          result.videos = cleaned;
          result.page = page;
          result.hasMore = false;
          return result;
        }
      }
    }
  } catch {}

  const fallback: any = [];
  fallback.videos = fallback;
  fallback.page = page;
  fallback.hasMore = false;
  return fallback;
};

export const getMastiBaseComments = async (videoId: string) => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/comments/${encodeURIComponent(videoId)}`, {
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (data && data.success && Array.isArray(data.comments)) {
      return data.comments.map((comment: any) => ({
        ...comment,
        isVerified: parseMastiBaseVerifiedFlag(
          comment?.isVerified ?? comment?.user?.isVerified ?? comment?.profile?.isVerified,
        ),
      }));
    }
  } catch (err) {
    console.warn('[MastiBase API] Could not fetch comments:', err);
  }

  try {
    const raw = localStorage.getItem(`@masti_comments_${videoId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
};

export const getUserSocialCache = (userId: string) => {
  try {
    const raw = localStorage.getItem(`@masti_social_${userId}`);
    return raw ? JSON.parse(raw) : { liked: {}, saved: {}, following: {}, shares: {} };
  } catch {
    return { liked: {}, saved: {}, following: {}, shares: {} };
  }
};

export const saveUserSocialCache = (userId: string, data: any) => {
  try {
    localStorage.setItem(`@masti_social_${userId}`, JSON.stringify(data));
  } catch {}
};

export const commentOnMastiBaseVideo = async (videoIdOrPayload: any, commentArg?: string, userArg?: any) => {
  const isObj = typeof videoIdOrPayload === 'object' && videoIdOrPayload !== null;
  const mediaId = String(isObj ? (videoIdOrPayload.mediaId || videoIdOrPayload.videoId || videoIdOrPayload.id) : videoIdOrPayload).replace(/^db-/, '');
  const comment = isObj ? (videoIdOrPayload.comment || videoIdOrPayload.text || '') : (commentArg || '');
  const userId = String(isObj ? (videoIdOrPayload.userId || videoIdOrPayload.email || '') : (userArg?.email || userArg?.userId || userArg?.accountId || '')).trim();
  const userName = String(isObj ? (videoIdOrPayload.userName || videoIdOrPayload.name || '') : (userArg?.name || userArg?.username || '')).trim();
  const userAvatar = isObj ? (videoIdOrPayload.userAvatar || videoIdOrPayload.avatarUrl || '') : (userArg?.profileImage || '');

  if (!userId || !mediaId) {
    return { success: false, error: 'Sign in required to comment.' };
  }

  const newComment = {
    id: 'c_' + Date.now(),
    videoId: mediaId,
    userId,
    userName: userName || (userId.includes('@') ? userId.split('@')[0] : userId),
    userAvatar,
    text: comment,
    comment,
    likes: 0,
    createdAt: 'Just now',
    time: 'now',
  };

  try {
    const existing = JSON.parse(localStorage.getItem(`@masti_comments_${mediaId}`) || '[]');
    existing.push(newComment);
    localStorage.setItem(`@masti_comments_${mediaId}`, JSON.stringify(existing));
  } catch {}

  try {
    const res = await fetch(`${API_BASE}/api/v1/social/comment`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        mediaId,
        userId,
        userName: newComment.userName,
        ...(userAvatar ? { userAvatar } : {}),
        comment,
      }),
    });
    const data = await res.json();
    if (data && data.success) {
      return data;
    }
  } catch (err) {
    console.warn('[MastiBase API] Comment sync failed:', err);
  }

  return { success: true, comment: newComment };
};

export const likeMastiBaseVideo = async (videoIdOrPayload: any, likeArg?: boolean, user?: any) => {
  const isObj = typeof videoIdOrPayload === 'object' && videoIdOrPayload !== null;
  const mediaId = String(isObj ? (videoIdOrPayload.mediaId || videoIdOrPayload.videoId || videoIdOrPayload.id) : videoIdOrPayload).replace(/^db-/, '');
  const userId = String(isObj ? (videoIdOrPayload.userId || videoIdOrPayload.email || '') : (user?.email || user?.userId || user?.accountId || '')).trim();
  const rawName = String(isObj ? (videoIdOrPayload.userName || videoIdOrPayload.name || '') : (user?.name || user?.username || '')).trim();
  const userName = rawName || (userId.includes('@') ? userId.split('@')[0] : userId);
  const userAvatar = isObj ? (videoIdOrPayload.userAvatar || videoIdOrPayload.avatarUrl || '') : (user?.profileImage || '');
  const isLike = isObj ? (typeof videoIdOrPayload.like === 'boolean' ? videoIdOrPayload.like : true) : (typeof likeArg === 'boolean' ? likeArg : true);

  if (!userId || !mediaId) {
    return { success: false, mediaId, videoId: mediaId, isLiked: isLike };
  }

  if (userId) {
    const cache = getUserSocialCache(userId);
    cache.liked = cache.liked || {};
    cache.liked[mediaId] = isLike;
    saveUserSocialCache(userId, cache);
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/social/like`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        mediaId,
        userId,
        userName,
        ...(userAvatar ? { userAvatar } : {}),
        like: isLike,
      }),
    });
    const data = await res.json();
    if (data && data.success) {
      return data;
    }
  } catch (err) {
    console.warn('[MastiBase API] Like sync failed:', err);
  }
  return { success: true, mediaId, videoId: mediaId, isLiked: isLike };
};

export const bookmarkMastiBaseVideo = async (videoIdOrPayload: any, bookmarkArg?: boolean, user?: any) => {
  const isObj = typeof videoIdOrPayload === 'object' && videoIdOrPayload !== null;
  const mediaId = String(isObj ? (videoIdOrPayload.mediaId || videoIdOrPayload.videoId || videoIdOrPayload.id) : videoIdOrPayload).replace(/^db-/, '');
  const userId = String(isObj ? (videoIdOrPayload.userId || videoIdOrPayload.email || '') : (user?.email || user?.userId || user?.accountId || '')).trim();
  const userName = isObj ? (videoIdOrPayload.userName || videoIdOrPayload.name) : (user?.name || user?.username);
  const userAvatar = isObj ? (videoIdOrPayload.userAvatar || videoIdOrPayload.avatarUrl || '') : (user?.profileImage || '');
  const isBookmark = isObj ? (typeof videoIdOrPayload.bookmark === 'boolean' ? videoIdOrPayload.bookmark : true) : (typeof bookmarkArg === 'boolean' ? bookmarkArg : true);

  if (!userId || !mediaId) {
    return { success: false, mediaId, videoId: mediaId, isBookmarked: isBookmark };
  }

  if (userId) {
    const cache = getUserSocialCache(userId);
    cache.saved = cache.saved || {};
    cache.saved[mediaId] = isBookmark;
    saveUserSocialCache(userId, cache);
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/social/bookmark`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        mediaId,
        userId,
        ...(userName ? { userName } : {}),
        ...(userAvatar ? { userAvatar } : {}),
        isBookmark,
      }),
    });
    const data = await res.json();
    if (data && data.success) {
      return data;
    }
  } catch (err) {
    console.warn('[MastiBase API] Bookmark sync failed:', err);
  }
  return { success: true, mediaId, videoId: mediaId, isBookmarked: isBookmark };
};

export const shareMastiBaseVideo = async (videoIdOrPayload: any, platformArg = 'direct', user?: any) => {
  const isObj = typeof videoIdOrPayload === 'object' && videoIdOrPayload !== null;
  const mediaId = String(isObj ? (videoIdOrPayload.mediaId || videoIdOrPayload.videoId || videoIdOrPayload.id) : videoIdOrPayload).replace(/^db-/, '');
  const userId = String(isObj ? (videoIdOrPayload.userId || videoIdOrPayload.email || '') : (user?.email || user?.userId || user?.accountId || '')).trim();
  const userName = isObj ? (videoIdOrPayload.userName || videoIdOrPayload.name || '') : (user?.name || user?.username || '');
  const userAvatar = isObj ? (videoIdOrPayload.userAvatar || videoIdOrPayload.avatarUrl || '') : (user?.profileImage || '');
  const platform = isObj ? (videoIdOrPayload.platform || 'direct') : platformArg;

  if (!userId || !mediaId) {
    return { success: false, mediaId, videoId: mediaId };
  }

  if (userId) {
    const cache = getUserSocialCache(userId);
    cache.shares = cache.shares || {};
    cache.shares[mediaId] = (cache.shares[mediaId] || 0) + 1;
    saveUserSocialCache(userId, cache);
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/social/share`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        mediaId,
        userId,
        ...(userName ? { userName } : {}),
        ...(userAvatar ? { userAvatar } : {}),
        platform,
      }),
    });
    const data = await res.json();
    if (data && data.success) {
      return data;
    }
  } catch (err) {
    console.warn('[MastiBase API] Share sync failed:', err);
  }
  return { success: true, mediaId, videoId: mediaId };
};

export const deleteMastiBaseVideo = async (
  videoId: string,
  options?: { userId?: string | null; userEmail?: string | null; videoUrl?: string | null },
) => {
  const rawId = String(videoId || '').trim();
  const cleanId = rawId.replace(/^db-/, '');
  saveLocalDeletedVideoIds([rawId, cleanId, cleanId ? `db-${cleanId}` : '', options?.videoUrl]);

  let serverMastiBaseDeleted = false;
  try {
    const serverRes = await fetch('/api/videos/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: cleanId || rawId,
        mediaId: cleanId || rawId,
        videoUrl: options?.videoUrl || undefined,
        userId: options?.userId || undefined,
        userEmail: options?.userEmail || undefined,
      }),
    });
    const serverData = await serverRes.json().catch(() => null);
    serverMastiBaseDeleted = Boolean(serverData?.mastiBaseDeleted);
  } catch (err) {
    console.warn('[MastiBase API] Server delete proxy warning:', err);
  }

  let clientMastiBaseDeleted = serverMastiBaseDeleted;
  if (cleanId && !serverMastiBaseDeleted) {
    const queryParts: string[] = [];
    if (options?.userId) queryParts.push(`userId=${encodeURIComponent(options.userId)}`);
    if (options?.userEmail) queryParts.push(`userEmail=${encodeURIComponent(options.userEmail)}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const body = JSON.stringify({
      id: cleanId,
      mediaId: cleanId,
      videoId: cleanId,
      ...(options?.userId ? { userId: options.userId } : {}),
      ...(options?.userEmail ? { userEmail: options.userEmail } : {}),
    });
    const directEndpoints = [
      `${API_BASE}/api/v1/media/${encodeURIComponent(cleanId)}${qs}`,
      `${API_BASE}/api/videos/${encodeURIComponent(cleanId)}${qs}`,
      `${API_BASE}/api/v1/videos/${encodeURIComponent(cleanId)}${qs}`,
    ];
    try {
      const results = await Promise.all(
        directEndpoints.map(async (ep) => {
          try {
            const res = await fetch(ep, {
              method: 'DELETE',
              headers: apiHeaders(),
              body,
            });
            return res.ok;
          } catch {
            return false;
          }
        }),
      );
      clientMastiBaseDeleted = results.some(Boolean);
    } catch {}
  }

  return {
    success: true,
    videoId: cleanId || rawId,
    mastiBaseDeleted: clientMastiBaseDeleted,
  };
};

export const getMastiBaseBookmarks = async (email: string) => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/bookmarks/${encodeURIComponent(email)}`, {
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (data && data.success && Array.isArray(data.bookmarks)) {
      return data.bookmarks;
    }
  } catch (err) {
    console.warn('[MastiBase API] Could not fetch bookmarks:', err);
  }
  return [];
};

const ADMOB_CONFIG_STORAGE_KEY = '@masti_admob_config_v1';
const GOOGLE_TEST_ADMOB_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const GOOGLE_TEST_BANNER_UNIT_ID = 'ca-app-pub-3940256099942544/6300978111';
const GOOGLE_TEST_INTERSTITIAL_UNIT_ID = 'ca-app-pub-3940256099942544/1033173712';
const GOOGLE_TEST_REWARDED_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';
const GOOGLE_TEST_NATIVE_UNIT_ID = 'ca-app-pub-3940256099942544/2247696110';

const normalizeMastiBaseAdsConfig = (raw: any): MastiBaseAdsConfig => {
  const payload = raw?.data && typeof raw.data === 'object' ? raw.data : raw || {};
  const globalAdsEnabled = Boolean(
    payload.isAdMobEnabled ?? payload.globalAdsEnabled ?? payload.enabled ?? true,
  );
  const testAdsEnabled = Boolean(payload.testMode ?? payload.testAdsEnabled ?? false);
  const parsedFreq = Number(
    payload.adFrequency ?? payload.interstitialFrequency ?? payload.reelsAdFrequency ?? 4,
  );
  const adFrequency = Number.isFinite(parsedFreq) && parsedFreq >= 1 ? Math.floor(parsedFreq) : 4;
  const parsedBannerFreq = Number(payload.bannerFrequency ?? adFrequency);
  const bannerFrequency =
    Number.isFinite(parsedBannerFreq) && parsedBannerFreq >= 1
      ? Math.floor(parsedBannerFreq)
      : adFrequency;

  const cleanUnit = (value: any, testFallback: string) => {
    const str = typeof value === 'string' ? value.trim() : '';
    if (str) return str;
    return testAdsEnabled ? testFallback : '';
  };

  const rawTheme = payload.theme && typeof payload.theme === 'object' ? payload.theme : undefined;
  const theme: MastiBaseRemoteTheme | undefined = rawTheme
    ? {
        iconStyle: typeof rawTheme.iconStyle === 'string' ? rawTheme.iconStyle : undefined,
        fontFamily: typeof rawTheme.fontFamily === 'string' ? rawTheme.fontFamily : undefined,
        isDarkMode: typeof rawTheme.isDarkMode === 'boolean' ? rawTheme.isDarkMode : undefined,
        layoutType: typeof rawTheme.layoutType === 'string' ? rawTheme.layoutType : undefined,
        borderRadius: Number.isFinite(Number(rawTheme.borderRadius))
          ? Number(rawTheme.borderRadius)
          : undefined,
        cameraEngine: typeof rawTheme.cameraEngine === 'string' ? rawTheme.cameraEngine : undefined,
        primaryColor: typeof rawTheme.primaryColor === 'string' ? rawTheme.primaryColor : undefined,
        secondaryColor:
          typeof rawTheme.secondaryColor === 'string' ? rawTheme.secondaryColor : undefined,
      }
    : undefined;

  return {
    enabled: globalAdsEnabled,
    globalAdsEnabled,
    testAdsEnabled,
    appId: cleanUnit(payload.appId, GOOGLE_TEST_ADMOB_APP_ID),
    bannerAdUnitId: cleanUnit(payload.bannerAdUnitId, GOOGLE_TEST_BANNER_UNIT_ID),
    interstitialAdUnitId: cleanUnit(payload.interstitialAdUnitId, GOOGLE_TEST_INTERSTITIAL_UNIT_ID),
    rewardedAdUnitId: cleanUnit(payload.rewardedAdUnitId, GOOGLE_TEST_REWARDED_UNIT_ID),
    nativeAdUnitId: cleanUnit(payload.nativeAdUnitId, GOOGLE_TEST_NATIVE_UNIT_ID),
    adFrequency,
    bannerFrequency,
    interstitialFrequency: adFrequency,
    isUploadAllowed: payload.isUploadAllowed !== false,
    isMaintenanceMode: Boolean(payload.isMaintenanceMode),
    isVerificationEnabled: payload.isVerificationEnabled !== false,
    announcementText:
      typeof payload.announcementText === 'string' ? payload.announcementText.trim() : '',
    theme,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : undefined,
  };
};

export const getMastiBaseAdsConfig = async (): Promise<MastiBaseAdsConfig> => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/admob`, {
      headers: apiHeaders(),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (data) {
        const normalized = normalizeMastiBaseAdsConfig(data);
        try {
          localStorage.setItem(ADMOB_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
        } catch {}
        return normalized;
      }
    }
  } catch (err) {
    console.warn('[MastiBase API] Could not fetch AdMob config:', err);
  }

  try {
    const cachedRaw = localStorage.getItem(ADMOB_CONFIG_STORAGE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached && typeof cached === 'object') {
        return normalizeMastiBaseAdsConfig(cached);
      }
    }
  } catch {}

  return normalizeMastiBaseAdsConfig({
    isAdMobEnabled: true,
    isVerificationEnabled: true,
    testMode: true,
    adFrequency: 4,
    appId: GOOGLE_TEST_ADMOB_APP_ID,
    bannerAdUnitId: GOOGLE_TEST_BANNER_UNIT_ID,
    interstitialAdUnitId: GOOGLE_TEST_INTERSTITIAL_UNIT_ID,
    rewardedAdUnitId: GOOGLE_TEST_REWARDED_UNIT_ID,
    nativeAdUnitId: GOOGLE_TEST_NATIVE_UNIT_ID,
  });
};

export const getMastiBaseMonetization = async (email: string) => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/monetization/${encodeURIComponent(email)}`, {
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (data) {
      return {
        coins: Math.round((data.walletBalance || 0) * 10),
        diamonds: Math.round((data.walletBalance || 0) / 2),
        estimatedEarningsInr: data.walletBalance || 0,
        eligibleForPayout: data.isEnabled ?? true,
        minPayoutAmount: 500,
        totalEarnings: data.totalEarnings || 0,
        rpm: data.rpm || 15,
        totalViews: data.totalViews || 0,
      };
    }
  } catch (err) {
    console.warn('[MastiBase API] Could not load monetization:', err);
  }
  return {
    coins: 0,
    diamonds: 0,
    estimatedEarningsInr: 0,
    eligibleForPayout: false,
    minPayoutAmount: 500,
    totalEarnings: 0,
  };
};

export const requestMastiBasePayout = async (accountIdOrPayload: any, amount?: number, details?: any) => {
  const isObj = typeof accountIdOrPayload === 'object' && accountIdOrPayload !== null;
  const accountId = isObj ? (accountIdOrPayload.userId || accountIdOrPayload.email) : accountIdOrPayload;
  const payoutAmount = isObj ? (accountIdOrPayload.amount ?? 0) : (amount ?? 0);
  const payoutDetails = isObj ? accountIdOrPayload : details;
  const method = payoutDetails?.accountNumber ? 'bank' : 'upi';
  const accountInfo = method === 'bank' ? JSON.stringify(payoutDetails) : (payoutDetails?.upiId || payoutDetails?.accountNumber || 'user@ybl');

  try {
    const res = await fetch(`${API_BASE}/api/v1/social/monetization/payout`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ userId: accountId, amount: payoutAmount, method, accountInfo, ...(isObj ? accountIdOrPayload : {}) }),
    });
    const data = await res.json();
    if (data && data.success) {
      return data;
    }
  } catch (err) {
    console.warn('[MastiBase API] Payout request failed:', err);
  }

  return {
    success: true,
    amount,
    accountId,
    requestedAt: new Date().toISOString(),
    processAfter: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    status: 'pending',
  };
};

const DEFAULT_INBOX_NOTIFICATIONS: any[] = [];

const READ_NOTIF_IDS_STORAGE_KEY = '@masti_read_notif_ids_v1';

export const getLocalReadNotificationIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(READ_NOTIF_IDS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
};

export const markLocalReadNotificationIds = (ids: string[]) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  try {
    const existing = getLocalReadNotificationIds();
    ids.forEach((id) => {
      const s = String(id || '').trim();
      if (s) existing.add(s);
    });
    const trimmed = Array.from(existing).slice(-1000);
    localStorage.setItem(READ_NOTIF_IDS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
};

const DISMISSED_NOTIF_IDS_STORAGE_KEY = '@masti_dismissed_notif_ids_v1';
const DISMISSED_NOTIF_SIGS_STORAGE_KEY = '@masti_dismissed_notif_sigs_v1';

export interface DismissedNotifSignature {
  type: string;
  videoId: string;
  comment: string;
  actors: string[];
  title?: string;
  message?: string;
}

const normalizeMbNotifKey = (val: unknown): string =>
  String(val ?? '').trim().replace(/^@+/, '').toLowerCase();

const normalizeMbNotifType = (rawItem: any): string => {
  const t = String(rawItem?.type || rawItem?.notificationType || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (t === 'bookmark') return 'save';
  if (t === 'comments') return 'comment';
  return t || 'activity';
};

const normalizeMbNotifVideoId = (val: unknown): string =>
  String(val ?? '').trim().replace(/^db-/i, '').toLowerCase();

const isVideoAssetUrl = (url: string): boolean =>
  /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(String(url || '').trim());

const extractCommentTextFromMastiBaseMessage = (message: any, explicitComment?: any): string => {
  const direct = String(explicitComment || '').trim();
  if (direct) return direct;
  const msg = String(message || '').trim();
  if (!msg) return '';
  const colonIdx = msg.indexOf(':');
  const candidate = colonIdx !== -1 ? msg.slice(colonIdx + 1).trim() : msg;
  return candidate.replace(/^["'“”]|["'“”]$/g, '').trim() || msg;
};

const FAKE_ACTOR_KEY_SET = new Set([
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

export const isPlaceholderActorValue = (val: unknown): boolean => {
  const norm = String(val ?? '')
    .trim()
    .replace(/^@+(?=[^@]+$)/, '')
    .replace(/^@+/, '')
    .toLowerCase();
  if (!norm) return true;
  if (FAKE_ACTOR_KEY_SET.has(norm)) return true;
  if (/^usr_anonymous\b/.test(norm)) return true;
  return false;
};

const extractMbNotifActors = (rawItem: any): string[] => {
  if (!rawItem || typeof rawItem !== 'object') return [];
  const rawTokens = [
    rawItem.actorId,
    rawItem.senderId,
    rawItem.fromUserId,
    ...(Array.isArray(rawItem.senderAliases) ? rawItem.senderAliases : []),
    rawItem.username,
    rawItem.userId,
    rawItem.actorName,
    rawItem.senderName,
    rawItem.fromUserName,
    rawItem.userName,
  ]
    .map(normalizeMbNotifKey)
    .filter((k) => Boolean(k) && !isPlaceholderActorValue(k) && !/^notification-/i.test(k));

  const out = new Set<string>(rawTokens);
  rawTokens.forEach((tok) => {
    if (tok.includes('@')) {
      const local = tok.split('@')[0]?.trim();
      if (local && !isPlaceholderActorValue(local)) out.add(local);
    }
  });
  return Array.from(out);
};

export const buildMastiBaseNotifSignature = (rawItem: any): DismissedNotifSignature | null => {
  if (!rawItem || typeof rawItem !== 'object') return null;
  const type = normalizeMbNotifType(rawItem);
  if (type === 'chat' || type === 'direct_chat_message') return null;
  const videoId = type === 'follow' ? '' : normalizeMbNotifVideoId(rawItem.videoId || rawItem.mediaId);
  const comment = type === 'comment'
    ? extractCommentTextFromMastiBaseMessage(rawItem.message, rawItem.comment)
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    : '';
  const actors = extractMbNotifActors(rawItem);
  const title = String(rawItem.title || '').trim().toLowerCase();
  const message = String(rawItem.message || '').trim().toLowerCase();
  if (actors.length === 0 && !title && !message) return null;
  return {
    type,
    videoId,
    comment,
    actors,
    ...(type.startsWith('support_') || type === 'admin_message' || type === 'message'
      ? { title, message }
      : {}),
  };
};

export const getLocalDismissedNotificationIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DISMISSED_NOTIF_IDS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.map((v) => String(v || '').trim().replace(/^fs_/, '')).filter(Boolean))
      : new Set();
  } catch {
    return new Set();
  }
};

export const markLocalDismissedNotificationIds = (ids: string[]) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  try {
    const existing = getLocalDismissedNotificationIds();
    ids.forEach((id) => {
      const raw = String(id || '').trim();
      const s = raw.replace(/^fs_/, '');
      if (s) existing.add(s);
    });
    const trimmed = Array.from(existing).slice(-2000);
    localStorage.setItem(DISMISSED_NOTIF_IDS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
};

export const getLocalDismissedNotificationSignatures = (): DismissedNotifSignature[] => {
  try {
    const raw = localStorage.getItem(DISMISSED_NOTIF_SIGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s === 'object') : [];
  } catch {
    return [];
  }
};

export const markLocalDismissedNotificationSignatures = (items: any[]) => {
  if (!Array.isArray(items) || items.length === 0) return;
  try {
    const existing = getLocalDismissedNotificationSignatures();
    for (const item of items) {
      const sig = buildMastiBaseNotifSignature(item);
      if (!sig) continue;
      const dup = existing.find((e) => {
        if (e.type !== sig.type) return false;
        if (sig.type !== 'follow' && e.videoId !== sig.videoId) return false;
        if (sig.type === 'comment' && e.comment !== sig.comment) return false;
        if (sig.title !== undefined && (e.title !== sig.title || e.message !== sig.message)) return false;
        if (sig.actors.length === 0 || !Array.isArray(e.actors) || e.actors.length === 0) {
          return sig.actors.length === 0 && (!e.actors || e.actors.length === 0);
        }
        return sig.actors.some((a) => e.actors.includes(a));
      });
      if (dup) {
        dup.actors = Array.from(new Set([...(dup.actors || []), ...sig.actors]));
      } else {
        existing.push(sig);
      }
    }
    localStorage.setItem(DISMISSED_NOTIF_SIGS_STORAGE_KEY, JSON.stringify(existing.slice(-2000)));
  } catch {}
};

export const isMastiBaseNotificationDismissed = (
  rawItem: any,
  dismissedIdsSet?: Set<string>,
  dismissedSigs?: DismissedNotifSignature[],
): boolean => {
  if (!rawItem || typeof rawItem !== 'object') return false;
  const ids = dismissedIdsSet || getLocalDismissedNotificationIds();
  const candidateIds = [
    rawItem.notificationId,
    rawItem.id,
    ...(Array.isArray(rawItem._mergedIds) ? rawItem._mergedIds : []),
  ]
    .map((v) => String(v || '').trim().replace(/^fs_/, ''))
    .filter(Boolean);
  if (candidateIds.some((id) => ids.has(id))) return true;

  const sig = buildMastiBaseNotifSignature(rawItem);
  if (!sig) return false;
  const sigs = dismissedSigs || getLocalDismissedNotificationSignatures();
  return sigs.some((s) => {
    if (!s || s.type !== sig.type) return false;
    if (sig.type.startsWith('support_') || sig.type === 'admin_message' || sig.type === 'message') {
      return Boolean(sig.title || sig.message) && s.title === sig.title && s.message === sig.message;
    }
    if (sig.type !== 'follow' && s.videoId !== sig.videoId) return false;
    if (sig.type === 'comment' && s.comment !== sig.comment) return false;
    if (sig.actors.length === 0 || !Array.isArray(s.actors) || s.actors.length === 0) return false;
    return sig.actors.some((a) => s.actors.includes(a));
  });
};

export const preserveMastiBaseNotificationsLocally = (
  ownerAliases: string[],
  items: any[],
) => {
  if (typeof localStorage === 'undefined' || !Array.isArray(ownerAliases) || !Array.isArray(items)) return;
  const dismissedIds = getLocalDismissedNotificationIds();
  const dismissedSigs = getLocalDismissedNotificationSignatures();
  const safeItems = items.filter((item) => item && !isMastiBaseNotificationDismissed(item, dismissedIds, dismissedSigs));
  if (safeItems.length === 0) return;
  ownerAliases.forEach((alias) => {
    const clean = normalizeMbNotifKey(alias);
    if (!clean || isPlaceholderActorValue(clean)) return;
    try {
      const key = `@masti_notifs_${clean}`;
      const existingRaw = localStorage.getItem(key);
      const existing: any[] = existingRaw ? JSON.parse(existingRaw) : [];
      const mergedMap = new Map<string, any>();
      (Array.isArray(existing) ? existing : []).forEach((it) => {
        if (!it || isMastiBaseNotificationDismissed(it, dismissedIds, dismissedSigs)) return;
        const id = String(it.notificationId || it.id || '').trim().replace(/^fs_/, '');
        if (id) mergedMap.set(id, { ...it, id, notificationId: id });
      });
      safeItems.forEach((it) => {
        const id = String(it.notificationId || it.id || '').trim().replace(/^fs_/, '');
        if (id) mergedMap.set(id, { ...it, id, notificationId: id });
      });
      localStorage.setItem(key, JSON.stringify(Array.from(mergedMap.values()).slice(0, 100)));
    } catch {}
  });
};

export const getMastiBaseNotifications = async (ownerId?: string) => {
  const rawQueryId = String(ownerId || '').trim().replace(/^@+/, '');
  const cleanId = rawQueryId.toLowerCase();
  if (!cleanId) return [];

  const list: any[] = [];
  const seenIds = new Set<string>();
  const localReadIds = getLocalReadNotificationIds();
  const localDismissedIds = getLocalDismissedNotificationIds();
  const localDismissedSigs = getLocalDismissedNotificationSignatures();

  const normalizeKey = (v: any) => String(v || '').trim().toLowerCase().replace(/^@+/, '');

  const upsertItem = (raw: any) => {
    if (!raw || typeof raw !== 'object') return;
    const rawType = String(raw.type || '').trim().toLowerCase();
    // Direct chat notifications belong in the chat conversations list, not activity rows
    if (rawType === 'chat' || rawType === 'direct_chat_message') return;

    const normalizedType = rawType === 'bookmark' ? 'save' : (rawType || 'activity');
    const id = String(raw.notificationId || raw.id || '').trim().replace(/^fs_/, '');
    if (!id || seenIds.has(id) || isMastiBaseNotificationDismissed(raw, localDismissedIds, localDismissedSigs)) return;

    const actorIdCandidates = [
      raw.actorId,
      raw.senderId,
      raw.fromUserId,
      ...(Array.isArray(raw.senderAliases) ? raw.senderAliases : []),
    ]
      .map((v) => String(v || '').trim())
      .filter((v) => v && !isPlaceholderActorValue(v));

    const actorIdRaw = actorIdCandidates[0] || '';
    const normActor = normalizeKey(actorIdRaw);
    const rawActorNameCandidate = String(raw.actorName || raw.senderName || raw.fromUserName || '').trim();
    const actorNameRaw = !isPlaceholderActorValue(rawActorNameCandidate) ? rawActorNameCandidate : '';

    // Strict real-user check: drop usr_anonymous / Masti User / Someone / A Fan / unattributed fake rows
    if (!actorIdRaw && !actorNameRaw) return;
    if (normActor && normActor === cleanId) return;

    const fallbackHandleFromId = actorIdRaw.includes('@')
      ? `@${actorIdRaw.split('@')[0]}`
      : (actorIdRaw.startsWith('@') ? actorIdRaw : `@${actorIdRaw}`);
    const displayFromId = actorIdRaw
      ? (actorIdRaw.includes('@') && actorNameRaw
          ? (actorNameRaw.startsWith('@') ? actorNameRaw : `@${actorNameRaw}`)
          : fallbackHandleFromId)
      : (actorNameRaw.startsWith('@') ? actorNameRaw : `@${actorNameRaw}`);

    const cleanAvatar = normalizeMastiAvatarUrl(
      raw.actorAvatar || raw.senderAvatar || raw.fromProfilePic || raw.avatar || raw.profilePic || '',
    );
    const rawThumb = String(raw.mediaThumbnail || raw.videoThumbnail || '').trim();
    const videoThumbnail = rawThumb && !isVideoAssetUrl(rawThumb) ? rawThumb : '';
    const recipientVal = normalizeKey(raw.recipientId || raw.userId || raw.videoOwnerId) || cleanId;
    const recipientAliases = Array.from(
      new Set(
        [
          recipientVal,
          cleanId,
          normalizeKey(raw.userId),
          normalizeKey(raw.videoOwnerId),
          ...(Array.isArray(raw.recipientAliases) ? raw.recipientAliases.map(normalizeKey) : []),
        ].filter(Boolean),
      ),
    );
    const senderAliases = Array.from(
      new Set(
        [
          normActor,
          normalizeKey(actorNameRaw),
          ...actorIdCandidates.map(normalizeKey),
        ].filter((k) => Boolean(k) && !isPlaceholderActorValue(k)),
      ),
    );
    if (senderAliases.length === 0) return;

    const commentVal =
      normalizedType === 'comment'
        ? extractCommentTextFromMastiBaseMessage(raw.message, raw.comment)
        : String(raw.comment || '');
    const isRead = Boolean(raw.isRead || raw.read || localReadIds.has(id));

    seenIds.add(id);
    list.push({
      ...raw,
      notificationId: id,
      id,
      type: normalizedType,
      recipientId: recipientVal,
      recipientAliases,
      videoOwnerId: raw.videoOwnerId ? String(raw.videoOwnerId) : recipientVal,
      actorId: actorIdRaw || normActor || senderAliases[0],
      actorName: actorNameRaw || displayFromId,
      senderId: normActor || senderAliases[0],
      senderAliases,
      senderName: actorNameRaw || displayFromId,
      senderAvatar: cleanAvatar,
      fromUserId: displayFromId,
      fromUserName: actorNameRaw || displayFromId,
      fromProfilePic: cleanAvatar,
      avatar: cleanAvatar,
      profilePic: cleanAvatar,
      videoId: String(raw.mediaId || raw.videoId || ''),
      videoThumbnail,
      comment: commentVal,
      title: String(raw.title || ''),
      message: String(raw.message || ''),
      isRead,
      read: isRead,
      createdAt: String(raw.createdAt || new Date().toISOString()),
    });
  };

  // 1. Fetch live notifications from MastiBase Cloud API
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/notifications/${encodeURIComponent(rawQueryId)}`, {
      headers: apiHeaders(),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const remoteList = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.notifications)
          ? data.notifications
          : Array.isArray(data?.data?.notifications)
            ? data.data.notifications
            : [];
      remoteList.forEach(upsertItem);
    }
  } catch (err) {
    console.warn('[MastiBase API] Could not fetch remote notifications:', err);
  }

  // 2. Merge with localStorage per-user cache (and strip fake/dismissed cached rows)
  try {
    const userKey = `@masti_notifs_${cleanId}`;
    const rawUser = localStorage.getItem(userKey);
    if (rawUser) {
      const userNotifs = JSON.parse(rawUser);
      if (Array.isArray(userNotifs)) {
        const cleanedCached = userNotifs.filter(
          (item) => item && !isMastiBaseNotificationDismissed(item, localDismissedIds, localDismissedSigs),
        );
        if (cleanedCached.length !== userNotifs.length) {
          localStorage.setItem(userKey, JSON.stringify(cleanedCached));
        }
        cleanedCached.forEach(upsertItem);
      }
    }
  } catch {}

  list.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));

  const expandActorSet = (item: any): string[] => {
    const out = new Set<string>();
    const raw = [
      item.actorId,
      item.senderId,
      item.fromUserId,
      item.fromUserName,
      item.actorName,
      item.senderName,
      ...(Array.isArray(item.senderAliases) ? item.senderAliases : []),
    ];
    raw.forEach((v) => {
      const k = normalizeKey(v);
      if (!k || isPlaceholderActorValue(k)) return;
      out.add(k);
      if (k.includes('@')) {
        const local = k.split('@')[0]?.trim();
        if (local && !isPlaceholderActorValue(local)) out.add(local);
      }
    });
    return Array.from(out);
  };

  const deduped: Array<{
    item: any;
    type: string;
    videoId: string;
    comment: string;
    actors: Set<string>;
    mergedIds: Set<string>;
  }> = [];

  for (const item of list) {
    const t = String(item.type || '').trim().toLowerCase();
    const semType = t === 'bookmark' ? 'save' : (t === 'comments' ? 'comment' : t);
    const vid = semType === 'follow' ? '' : String(item.videoId || '').trim().replace(/^db-/i, '').toLowerCase();
    const cmt = semType === 'comment'
      ? String(item.comment || '').replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
      : '';
    const actors = expandActorSet(item);
    const itemId = String(item.notificationId || item.id || '').trim();

    const match = deduped.find((g) => {
      if (g.type !== semType) return false;
      if (semType !== 'follow' && g.videoId !== vid) return false;
      if (semType === 'comment' && g.comment !== cmt) return false;
      return actors.some((a) => g.actors.has(a));
    });

    if (!match) {
      deduped.push({
        item: { ...item, ...(itemId ? { _mergedIds: [itemId] } : {}) },
        type: semType,
        videoId: vid,
        comment: cmt,
        actors: new Set(actors),
        mergedIds: new Set(itemId ? [itemId] : []),
      });
    } else {
      actors.forEach((a) => match.actors.add(a));
      if (itemId) match.mergedIds.add(itemId);
      const mergedRead = Boolean(match.item.read || match.item.isRead || item.read || item.isRead);
      match.item = {
        ...match.item,
        read: mergedRead,
        isRead: mergedRead,
        videoThumbnail: match.item.videoThumbnail || item.videoThumbnail || '',
        fromProfilePic: match.item.fromProfilePic || item.fromProfilePic || '',
        senderAvatar: match.item.senderAvatar || item.senderAvatar || '',
        avatar: match.item.avatar || item.avatar || '',
        profilePic: match.item.profilePic || item.profilePic || '',
        _mergedIds: Array.from(match.mergedIds),
      };
    }
  }

  return deduped.map((g) => g.item);
};

export const markMastiBaseNotificationRead = async (id: string, ownerId?: string) => {
  if (id) {
    markLocalReadNotificationIds([id]);
  }
  try {
    if (ownerId) {
      const cleanKey = `@masti_notifs_${String(ownerId).toLowerCase().replace(/^@+/, '')}`;
      const rawUser = localStorage.getItem(cleanKey);
      if (rawUser) {
        const userNotifs = JSON.parse(rawUser);
        if (Array.isArray(userNotifs)) {
          userNotifs.forEach((n: any) => {
            if (!id || n.id === id || n.notificationId === id) {
              n.read = true;
              n.isRead = true;
            }
          });
          localStorage.setItem(cleanKey, JSON.stringify(userNotifs));
        }
      }
    }
  } catch {}
  return { success: true };
};

export const deleteMastiBaseNotifications = async (
  ownerIds: string[],
  notificationIds: string[],
  dismissedItems: any[] = [],
  remainingNotifications: any[] = [],
): Promise<{ success: boolean; deletedAliases: string[] }> => {
  const cleanIds = Array.from(
    new Set(
      [
        ...(Array.isArray(notificationIds) ? notificationIds : []),
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

  if (cleanIds.length > 0) {
    markLocalDismissedNotificationIds(cleanIds);
  }
  if (dismissedItems.length > 0) {
    markLocalDismissedNotificationSignatures(dismissedItems);
  }

  const dismissedIdsSet = getLocalDismissedNotificationIds();
  const dismissedSigs = getLocalDismissedNotificationSignatures();

  const itemRecipientAliases = dismissedItems.flatMap((it) => [
    it?.recipientId,
    it?.videoOwnerId,
    ...(Array.isArray(it?.recipientAliases) ? it.recipientAliases : []),
  ]);

  const rawAliases = Array.from(
    new Set(
      [
        ...(Array.isArray(ownerIds) ? ownerIds : []),
        ...itemRecipientAliases,
        ...getCachedMastiBaseAliases([...(ownerIds || []), ...itemRecipientAliases]),
      ]
        .map((v) => String(v || '').trim().replace(/^@+(?=[^@]+$)/, ''))
        .filter((v) => Boolean(v) && !isPlaceholderActorValue(v)),
    ),
  );

  // Strip dismissed items from every @masti_notifs_* localStorage cache
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('@masti_notifs_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter(
              (item) => item && !isMastiBaseNotificationDismissed(item, dismissedIdsSet, dismissedSigs),
            );
            if (filtered.length !== parsed.length) {
              localStorage.setItem(key, JSON.stringify(filtered));
            }
          }
        } catch {}
      }
    }
  } catch {}

  const resolvedMore = await resolveMastiBaseOwnerAliases(rawAliases).catch(() => rawAliases);
  const allDeleteCandidates = Array.from(
    new Set(
      [...rawAliases, ...resolvedMore]
        .map((v) => String(v || '').trim().replace(/^@+/, ''))
        .filter((v) => Boolean(v) && !isPlaceholderActorValue(v)),
    ),
  ).sort((a, b) => {
    const rank = (v: string) => (v.startsWith('usr_') ? 0 : v.includes('@') ? 1 : v.length >= 20 ? 2 : 3);
    return rank(a) - rank(b);
  });

  // Preserve any non-dismissed notifications locally before clearing MastiBase user inbox
  if (Array.isArray(remainingNotifications) && remainingNotifications.length > 0) {
    preserveMastiBaseNotificationsLocally(allDeleteCandidates, remainingNotifications);
  }

  const primaryId = cleanIds[0] || '';
  const deletedAliases: string[] = [];

  await Promise.allSettled(
    allDeleteCandidates
      .filter((a) => !/^user_[a-z0-9]{6,}$/i.test(a) || a.startsWith('usr_'))
      .slice(0, 10)
      .map(async (alias) => {
        try {
          const qs = primaryId ? `?notificationId=${encodeURIComponent(primaryId)}` : '';
          const res = await fetch(
            `${API_BASE}/api/v1/social/notifications/${encodeURIComponent(alias)}${qs}`,
            {
              method: 'DELETE',
              headers: apiHeaders(),
              body: JSON.stringify({
                ...(primaryId ? { notificationId: primaryId, id: primaryId } : {}),
                notificationIds: cleanIds,
              }),
            },
          );
          if (res.ok) {
            deletedAliases.push(alias);
          }
        } catch {}
      }),
  );

  return { success: deletedAliases.length > 0, deletedAliases };
};

export const createMastiBaseNotification = async (targetIdOrPayload: any, notificationArg?: any) => {
  const isObj = typeof targetIdOrPayload === 'object' && targetIdOrPayload !== null;
  const payload = isObj ? targetIdOrPayload : (notificationArg || {});
  const targetId = String(isObj ? (payload.recipientId || payload.userId || payload.targetId) : targetIdOrPayload).trim();
  const cleanTarget = targetId.toLowerCase().replace(/^@+/, '');

  const fromUserId = String(payload.senderId || payload.fromUserId || payload.userId || '@user').trim();
  const cleanSender = fromUserId.toLowerCase().replace(/^@+/, '');

  // 1. Never notify oneself
  if (!cleanTarget || !cleanSender || cleanTarget === cleanSender) {
    return { success: true, skipped: true };
  }

  const notifId = payload.notificationId || payload.id || 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const fromUserName = payload.senderName || payload.fromUserName || payload.userName || fromUserId;
  const fromProfilePic = payload.senderAvatar || payload.fromProfilePic || payload.profilePic || payload.avatar || '';

  const newNotif = {
    notificationId: notifId,
    id: notifId,
    type: payload.type || 'activity',
    title: payload.title || '',
    message: payload.message || '',
    senderId: cleanSender,
    senderName: fromUserName,
    senderAvatar: fromProfilePic,
    fromUserId: `@${cleanSender}`,
    fromUserName,
    fromProfilePic,
    avatar: fromProfilePic,
    profilePic: fromProfilePic,
    videoId: payload.videoId ? String(payload.videoId) : '',
    videoOwnerId: cleanTarget,
    recipientId: cleanTarget,
    recipientAliases: [cleanTarget],
    comment: payload.comment || '',
    isRead: false,
    read: false,
    createdAt: payload.createdAt || new Date().toISOString(),
  };

  try {
    const cleanKey = `@masti_notifs_${cleanTarget}`;
    const rawUser = localStorage.getItem(cleanKey);
    const userNotifs: any[] = rawUser ? JSON.parse(rawUser) : [];
    const isUserDuplicate = userNotifs.some((n: any) =>
      n.type === newNotif.type &&
      String(n.videoId || '') === String(newNotif.videoId || '') &&
      String(n.senderId || n.fromUserId || '').toLowerCase().replace(/^@+/, '') === cleanSender &&
      (newNotif.type !== 'comment' || n.comment === newNotif.comment) &&
      (!n.isRead && !n.read)
    );
    if (!isUserDuplicate) {
      userNotifs.unshift(newNotif);
      localStorage.setItem(cleanKey, JSON.stringify(userNotifs.slice(0, 50)));
    }
  } catch {}

  return { success: true, notification: newNotif };
};

const MASTI_UID_MAP_PREFIX = '@masti_uid_map_';
const MASTI_ALIAS_MAP_PREFIX = '@masti_alias_map_';
const MASTI_PLACEHOLDER_ALIAS_SET = new Set([
  'all',
  'local_user',
  'user',
  'newuser',
  'creator',
  'you',
  'usr_anonymous',
  'anonymous',
  'masti creator',
]);

const normalizeMastiAliasKey = (val: unknown): string =>
  String(val ?? '').trim().replace(/^@+/, '').toLowerCase();

export const saveMastiBaseUidMapping = (
  aliases: Array<string | null | undefined>,
  resolvedProfile?: {
    id?: string | null;
    mastiBaseUserId?: string | null;
    email?: string | null;
    username?: string | null;
    userId?: string | null;
  },
) => {
  try {
    if (typeof localStorage === 'undefined') return;
    const allAliases = Array.from(
      new Set(
        [
          ...aliases,
          resolvedProfile?.id,
          resolvedProfile?.mastiBaseUserId,
          resolvedProfile?.email,
          resolvedProfile?.username,
          resolvedProfile?.userId,
        ]
          .map(normalizeMastiAliasKey)
          .filter((k) => Boolean(k) && !MASTI_PLACEHOLDER_ALIAS_SET.has(k)),
      ),
    );
    if (allAliases.length === 0) return;

    const canonicalMbId = [resolvedProfile?.mastiBaseUserId, resolvedProfile?.id, ...allAliases]
      .map(normalizeMastiAliasKey)
      .find((k) => k.startsWith('usr_') && k !== 'usr_anonymous');

    const mergedSet = new Set<string>(allAliases);
    allAliases.forEach((alias) => {
      try {
        const raw = localStorage.getItem(`${MASTI_ALIAS_MAP_PREFIX}${alias}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.map(normalizeMastiAliasKey).filter(Boolean).forEach((k) => mergedSet.add(k));
          }
        }
      } catch {}
    });

    const finalAliases = Array.from(mergedSet);
    finalAliases.forEach((alias) => {
      try {
        localStorage.setItem(`${MASTI_ALIAS_MAP_PREFIX}${alias}`, JSON.stringify(finalAliases));
        if (canonicalMbId) {
          localStorage.setItem(`${MASTI_UID_MAP_PREFIX}${alias}`, canonicalMbId);
        }
      } catch {}
    });
  } catch {}
};

export const getCachedMastiBaseAliases = (aliases: Array<string | null | undefined>): string[] => {
  const result = new Set<string>();
  const seed = aliases
    .map(normalizeMastiAliasKey)
    .filter((k) => Boolean(k) && !MASTI_PLACEHOLDER_ALIAS_SET.has(k));

  seed.forEach((k) => {
    result.add(k);
    try {
      if (typeof localStorage === 'undefined') return;
      const mappedUid = normalizeMastiAliasKey(localStorage.getItem(`${MASTI_UID_MAP_PREFIX}${k}`));
      if (mappedUid && !MASTI_PLACEHOLDER_ALIAS_SET.has(mappedUid)) {
        result.add(mappedUid);
      }
      const rawGroup = localStorage.getItem(`${MASTI_ALIAS_MAP_PREFIX}${k}`);
      if (rawGroup) {
        const parsed = JSON.parse(rawGroup);
        if (Array.isArray(parsed)) {
          parsed
            .map(normalizeMastiAliasKey)
            .filter((x) => Boolean(x) && !MASTI_PLACEHOLDER_ALIAS_SET.has(x))
            .forEach((x) => result.add(x));
        }
      }
    } catch {}
  });

  return Array.from(result);
};

export const resolveMastiBaseOwnerAliases = async (
  aliases: Array<string | null | undefined>,
): Promise<string[]> => {
  const cached = getCachedMastiBaseAliases(aliases);
  if (cached.length === 0) return [];
  const hasRealMastiBaseId = cached.some((a) => a.startsWith('usr_') && a !== 'usr_anonymous');
  if (hasRealMastiBaseId) return cached;

  const lookupCandidates = cached
    .filter((a) => a.includes('@') || (!/^user_[a-z0-9]{6,}$/i.test(a) && a.length >= 3))
    .sort((a, b) => (a.includes('@') ? 0 : 1) - (b.includes('@') ? 0 : 1))
    .slice(0, 2);

  await Promise.all(
    lookupCandidates.map(async (cand) => {
      try {
        const profile = await getMastiBaseProfile(cand);
        if (profile) {
          saveMastiBaseUidMapping([cand, ...cached], {
            id: profile.id,
            mastiBaseUserId: profile.mastiBaseUserId,
            email: profile.email,
            username: profile.username,
            userId: profile.userId,
          });
        }
      } catch {}
    }),
  );

  return getCachedMastiBaseAliases([...cached, ...aliases]);
};

export const followMastiBaseCreator = async (followerIdOrPayload: any, followingIdArg?: string) => {
  const isObj = typeof followerIdOrPayload === 'object' && followerIdOrPayload !== null;
  const followerId = isObj ? (followerIdOrPayload.followerId || followerIdOrPayload.userId) : followerIdOrPayload;
  const followingId = isObj ? (followerIdOrPayload.followingId || followerIdOrPayload.creatorId || followerIdOrPayload.targetId) : followingIdArg;
  const followerName = isObj ? (followerIdOrPayload.followerName || followerIdOrPayload.userName || followerIdOrPayload.name || '') : '';
  const followerAvatar = isObj ? (followerIdOrPayload.followerAvatar || followerIdOrPayload.userAvatar || followerIdOrPayload.avatarUrl || '') : '';

  const action = isObj ? (followerIdOrPayload.action || (followerIdOrPayload.isFollowing === false ? 'unfollow' : 'follow')) : 'follow';

  if (followerId) {
    const cache = getUserSocialCache(followerId);
    cache.following = cache.following || {};
    if (action === 'unfollow') {
      delete cache.following[followingId];
    } else {
      cache.following[followingId] = true;
    }
    saveUserSocialCache(followerId, cache);
  }

  try {
    const res = await fetch(`${API_BASE}/api/v1/social/follow`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        followerId,
        followingId,
        action,
        ...(followerName ? { followerName, userName: followerName } : {}),
        ...(followerAvatar ? { followerAvatar, userAvatar: followerAvatar } : {}),
      }),
    });
    const data = await res.json();
    if (data && data.success) {
      return data;
    }
  } catch (err) {
    console.warn('[MastiBase API] Follow sync failed:', err);
  }
  return {
    success: true,
    isFollowing: action !== 'unfollow',
    followersCount: undefined,
    followerId,
    followingId,
  };
};

export const getMastiBaseProfile = async (emailOrId: string) => {
  const cleanIdentifier = String(emailOrId || '').trim().replace(/^@+(?=[^@]+$)/, '');
  if (!cleanIdentifier) {
    return {
      id: '',
      mastiBaseUserId: undefined,
      email: undefined,
      userId: '',
      username: '',
      name: 'Masti Creator',
      bio: '',
      followersCount: 0,
      followingCount: 0,
      likesCount: 0,
      isVerified: false,
      avatarUrl: '',
      profileImage: '',
      avatar: '',
      socialLinks: {},
    };
  }
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/user/${encodeURIComponent(cleanIdentifier)}/synced-profile`, {
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (data && data.success !== false) {
      const userObj = data.user || data.data?.user || {};
      const profileObj = data.profile || data.data?.profile || {};
      const resolvedId = userObj.id || profileObj.id || data.mastiBaseUserId || '';
      const resolvedEmail = userObj.email || profileObj.email || data.email || (cleanIdentifier.includes('@') ? cleanIdentifier : '');
      const cleanAvatar = normalizeMastiAvatarUrl(
        userObj.avatarUrl ||
        profileObj.avatarUrl ||
        data.avatarUrl ||
        data.profileImage ||
        ''
      );
      const rawName = String(userObj.name || profileObj.name || data.name || '').trim();
      const rawUsername = String(
        userObj.username ||
        profileObj.username ||
        data.username ||
        (rawName.startsWith('@') ? rawName.replace(/^@+/, '') : '') ||
        (resolvedEmail ? resolvedEmail.split('@')[0] : cleanIdentifier.replace(/^@+/, ''))
      ).trim();

      const resolvedProfile = {
        id: resolvedId || resolvedEmail || cleanIdentifier,
        mastiBaseUserId: resolvedId || undefined,
        email: resolvedEmail || undefined,
        userId: rawUsername ? `@${rawUsername.replace(/^@+/, '')}` : (resolvedEmail || cleanIdentifier),
        username: rawUsername,
        userName: rawUsername ? `@${rawUsername.replace(/^@+/, '')}` : '',
        name: rawName || 'Masti Creator',
        bio: userObj.bio ?? profileObj.bio ?? data.bio ?? '',
        followersCount: Number(userObj.followersCount ?? profileObj.followersCount ?? data.followersCount ?? 0),
        followingCount: Number(userObj.followingCount ?? profileObj.followingCount ?? data.followingCount ?? 0),
        likesCount: Number(userObj.totalLikesReceived ?? profileObj.totalLikesReceived ?? data.totalLikes ?? 0),
        isVerified: Boolean(userObj.isVerified ?? profileObj.isVerified ?? data.isVerified),
        avatarUrl: cleanAvatar,
        profileImage: cleanAvatar,
        avatar: cleanAvatar,
        socialLinks: userObj.socialLinks || profileObj.socialLinks || data.socialLinks || {},
      };
      if (resolvedId || resolvedEmail) {
        saveMastiBaseUidMapping([cleanIdentifier], resolvedProfile);
      }
      return resolvedProfile;
    }
  } catch (err) {
    console.warn('[MastiBase API] Could not fetch synced profile:', err);
  }

  return {
    id: cleanIdentifier,
    email: cleanIdentifier.includes('@') ? cleanIdentifier : undefined,
    userId: cleanIdentifier,
    username: cleanIdentifier.includes('@') ? cleanIdentifier.split('@')[0] : cleanIdentifier.replace(/^@+/, ''),
    name: 'Masti Creator',
    bio: '',
    followersCount: 0,
    followingCount: 0,
    likesCount: 0,
    isVerified: false,
    avatarUrl: '',
    profileImage: '',
    avatar: '',
    socialLinks: {},
  };
};

export const lookupMastiBaseUser = async (identifier: string) => {
  return getMastiBaseProfile(identifier);
};

export const syncMastiBaseUser = async (profileData: {
  email: string;
  name?: string;
  userName?: string;
  username?: string;
  userId?: string;
  mastiBaseUserId?: string;
  avatarUrl?: string;
  profileImage?: string;
  bio?: string;
  firebaseUid?: string;
  phoneNumber?: string;
  socialLinks?: Record<string, string>;
}) => {
  const email = String(profileData.email || '').trim().toLowerCase();
  const rawHandle = String(
    profileData.userId || profileData.userName || profileData.username || ''
  ).trim();
  const cleanHandle = rawHandle.replace(/^@+/, '').trim();
  const isGenericHandle = !cleanHandle || /^(user|newuser)$/i.test(cleanHandle);
  const handleWithAt = !isGenericHandle ? `@${cleanHandle}` : '';
  const displayName = String(profileData.name || '').trim();
  const cleanAvatar = normalizeMastiAvatarUrl(profileData.avatarUrl || profileData.profileImage || '');
  const validRemoteAvatar = cleanAvatar && /^https?:\/\//i.test(cleanAvatar) && !/images\.unsplash\.com\/photo-1534528741775/i.test(cleanAvatar)
    ? cleanAvatar
    : '';
  // MastiBash's mutable display/handle field is user.name (updated via userName in social/user/sync
  // and name in email-sync). Using the @handle when present keeps MastiBash username/userId in lockstep
  // with the Masti Video app while the feed mapper also reads @handle from profile.name.
  const mastiBashUserLabel = handleWithAt || displayName || (email ? email.split('@')[0] : 'Masti Creator');

  let resolvedMastiBaseId = String(profileData.mastiBaseUserId || '').trim();
  let resolvedUser: any = null;

  try {
    // 1. Ensure user exists and capture permanent mastiBaseUserId if firebaseUid is provided
    if (profileData.firebaseUid) {
      const loginPayload: Record<string, any> = {
        firebaseUid: profileData.firebaseUid,
        email,
        name: mastiBashUserLabel,
        username: cleanHandle || (email ? email.split('@')[0] : undefined),
        bio: profileData.bio ?? '',
      };
      if (validRemoteAvatar) {
        loginPayload.avatarUrl = validRemoteAvatar;
      }
      const res = await fetch(`${API_BASE}/api/auth/firebase-login`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(loginPayload),
      });
      const loginData = await res.json().catch(() => null);
      if (loginData) {
        resolvedMastiBaseId = String(
          loginData.mastiBaseUserId || loginData.user?.id || resolvedMastiBaseId || ''
        ).trim();
        resolvedUser = loginData.user || loginData;
      }
    }

    // 2. Sync user profile via /api/v1/social/user/sync (updates user.name, user.avatarUrl via userAvatar, bio, socialLinks)
    const socialSyncPayload: Record<string, any> = {
      email,
      userEmail: email,
      userId: resolvedMastiBaseId || email,
      firebaseUid: profileData.firebaseUid || undefined,
      userName: mastiBashUserLabel,
      name: mastiBashUserLabel,
      username: cleanHandle || undefined,
      bio: profileData.bio ?? '',
    };
    if (validRemoteAvatar) {
      socialSyncPayload.userAvatar = validRemoteAvatar;
      socialSyncPayload.avatarUrl = validRemoteAvatar;
      socialSyncPayload.profileImage = validRemoteAvatar;
    }
    if (profileData.socialLinks && typeof profileData.socialLinks === 'object') {
      socialSyncPayload.socialLinks = profileData.socialLinks;
    }

    const socialRes = await fetch(`${API_BASE}/api/v1/social/user/sync`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(socialSyncPayload),
    });
    if (!socialRes.ok) {
      console.warn('[MastiBase API] social/user/sync returned status:', socialRes.status);
    }
    const socialData = await socialRes.json().catch(() => null);
    if (socialData?.data?.user) {
      resolvedUser = { ...(resolvedUser || {}), ...socialData.data.user };
      resolvedMastiBaseId = String(socialData.data.user.id || resolvedMastiBaseId || '').trim();
    }

    // 3. Also call /api/auth/email-sync so auth-table name and avatarUrl match identically
    let emailOk = false;
    if (email) {
      const emailSyncPayload: Record<string, any> = {
        email,
        firebaseUid: profileData.firebaseUid || undefined,
        name: mastiBashUserLabel,
        username: cleanHandle || undefined,
        userName: mastiBashUserLabel,
        bio: profileData.bio ?? '',
      };
      if (validRemoteAvatar) {
        emailSyncPayload.avatarUrl = validRemoteAvatar;
        emailSyncPayload.userAvatar = validRemoteAvatar;
      }
      const emailRes = await fetch(`${API_BASE}/api/auth/email-sync`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(emailSyncPayload),
      });
      emailOk = emailRes.ok;
      if (!emailRes.ok) {
        console.warn('[MastiBase API] email-sync returned status:', emailRes.status);
      }
      const emailData = await emailRes.json().catch(() => null);
      if (emailData?.user) {
        resolvedUser = { ...(resolvedUser || {}), ...emailData.user };
        resolvedMastiBaseId = String(emailData.user.id || resolvedMastiBaseId || '').trim();
      }
    }

    const syncSucceeded = Boolean(socialRes.ok || emailOk);
    const finalAvatar = normalizeMastiAvatarUrl(
      (syncSucceeded ? validRemoteAvatar : '') || resolvedUser?.avatarUrl || ''
    );
    if (resolvedMastiBaseId || email) {
      saveMastiBaseUidMapping(
        [profileData.firebaseUid, email, cleanHandle, resolvedMastiBaseId],
        {
          id: resolvedMastiBaseId || email,
          mastiBaseUserId: resolvedMastiBaseId || undefined,
          email,
          username: cleanHandle || resolvedUser?.username || '',
          userId: handleWithAt || mastiBashUserLabel,
        },
      );
    }
    return {
      success: syncSucceeded,
      id: resolvedMastiBaseId || email,
      mastiBaseUserId: resolvedMastiBaseId || undefined,
      email,
      name: resolvedUser?.name || mastiBashUserLabel,
      username: cleanHandle || resolvedUser?.username || '',
      userId: handleWithAt || mastiBashUserLabel,
      avatarUrl: finalAvatar,
      profileImage: finalAvatar,
      bio: resolvedUser?.bio ?? profileData.bio ?? '',
      isVerified: Boolean(resolvedUser?.isVerified),
      socialLinks: resolvedUser?.socialLinks || profileData.socialLinks || {},
      profile: resolvedUser || profileData,
    };
  } catch (err) {
    console.warn('[MastiBase API] Auth sync failed:', err);
  }
  return {
    success: false,
    id: resolvedMastiBaseId || email,
    mastiBaseUserId: resolvedMastiBaseId || undefined,
    email,
    name: mastiBashUserLabel,
    username: cleanHandle,
    userId: handleWithAt,
    avatarUrl: validRemoteAvatar,
    profileImage: validRemoteAvatar,
    bio: profileData.bio ?? '',
    socialLinks: profileData.socialLinks || {},
    profile: profileData,
  };
};

export const searchMastiBase = async (q: string, type = 'all') => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/search?query=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`, {
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (data && data.success) {
      const results = Array.isArray(data.results) ? data.results : [];
      const rawUsers =
        Array.isArray(data.users) && data.users.length > 0
          ? data.users
          : results.filter((r: any) => r?.type === 'user' || (!r?.type && (r?.username || r?.email || r?.isVerified !== undefined)));
      const rawVideos =
        Array.isArray(data.videos) && data.videos.length > 0
          ? data.videos
          : results.filter((r: any) => r?.type === 'video' || Boolean(r?.videoUrl || r?.fileUrl));
      const rawHashtags =
        Array.isArray(data.hashtags) && data.hashtags.length > 0
          ? data.hashtags
          : results.filter((r: any) => r?.type === 'hashtag' || Boolean(r?.hashtag));

      return {
        users: rawUsers.map((u: any) => ({
          ...u,
          mastiBaseUserId: u?.mastiBaseUserId || u?.id,
          isVerified: parseMastiBaseVerifiedFlag(u?.isVerified ?? u?.profile?.isVerified),
        })),
        videos: rawVideos.map((v: any) => ({
          ...v,
          isVerified: parseMastiBaseVerifiedFlag(v?.profile?.isVerified ?? v?.isVerified),
          ...(v?.profile
            ? {
                profile: {
                  ...v.profile,
                  isVerified: parseMastiBaseVerifiedFlag(v.profile.isVerified ?? v.isVerified),
                },
              }
            : {}),
        })),
        hashtags: rawHashtags,
      };
    }
  } catch (err) {
    console.warn('[MastiBase API] Search failed:', err);
  }
  return { users: [], videos: [], hashtags: [] };
};

export const MASTER_CREATOR_ADMIN_EMAIL = 'rajkalikumar8789@gmail.com';

export const uploadMastiBaseMedia = async (formData: FormData) => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/media/upload`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
      },
      body: formData,
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[MastiBase API] Media upload failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed' };
  }
};

export interface MastiBaseChatNotificationThread {
  notificationId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  lastMessage: string;
  lastMessageAt: string;
  isRead: boolean;
}

export const getMastiBaseChatNotifications = async (
  ownerAliases: string[],
): Promise<MastiBaseChatNotificationThread[]> => {
  const cleanAliases = Array.from(
    new Set(
      (Array.isArray(ownerAliases) ? ownerAliases : [])
        .map((v) => String(v ?? '').trim().replace(/^@+/, ''))
        .filter((v) => Boolean(v) && !isPlaceholderActorValue(v)),
    ),
  ).slice(0, 6);
  if (cleanAliases.length === 0) return [];

  const ownerSet = new Set<string>();
  cleanAliases.forEach((a) => {
    const lower = a.toLowerCase();
    ownerSet.add(lower);
    if (lower.includes('@')) {
      const local = lower.split('@')[0]?.trim();
      if (local && !isPlaceholderActorValue(local)) ownerSet.add(local);
    }
  });

  const responses = await Promise.all(
    cleanAliases.map(async (alias) => {
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/social/notifications/${encodeURIComponent(alias)}`,
          { headers: apiHeaders() },
        );
        if (!res.ok) return [];
        const data = await res.json().catch(() => null);
        if (Array.isArray(data?.data)) return data.data;
        if (Array.isArray(data?.notifications)) return data.notifications;
        if (Array.isArray(data?.data?.notifications)) return data.data.notifications;
        return [];
      } catch {
        return [];
      }
    }),
  );

  const byPeer = new Map<string, MastiBaseChatNotificationThread>();

  responses.flat().forEach((raw: any) => {
    if (!raw || typeof raw !== 'object') return;
    const rawType = String(raw.type || raw.notificationType || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (rawType !== 'chat' && rawType !== 'direct_chat_message') return;

    const actorCandidates = [
      raw.actorId,
      raw.senderId,
      raw.fromUserId,
      ...(Array.isArray(raw.senderAliases) ? raw.senderAliases : []),
    ]
      .map((v) => String(v ?? '').trim())
      .filter((v) => Boolean(v) && !isPlaceholderActorValue(v));

    const peerRaw = actorCandidates[0] || '';
    const normPeer = peerRaw.replace(/^@+/, '').toLowerCase();
    if (!normPeer || ownerSet.has(normPeer)) return;

    const rawName = String(raw.actorName || raw.senderName || raw.fromUserName || '').trim();
    const peerName = rawName && !isPlaceholderActorValue(rawName) ? rawName : peerRaw;
    const peerAvatar = normalizeMastiAvatarUrl(
      raw.actorAvatar || raw.senderAvatar || raw.fromProfilePic || raw.avatar || raw.profilePic || '',
    );
    const createdAt = String(raw.createdAt || raw.updatedAt || new Date().toISOString());
    const lastMessage = String(raw.message || raw.text || raw.comment || '').trim();
    const notifId = String(raw.notificationId || raw.id || `${normPeer}_${createdAt}`);
    const isRead = Boolean(raw.isRead || raw.read);

    const existing = byPeer.get(normPeer);
    const nextTs = Date.parse(createdAt) || 0;
    const prevTs = existing ? Date.parse(existing.lastMessageAt) || 0 : -1;
    if (!existing || nextTs >= prevTs) {
      byPeer.set(normPeer, {
        notificationId: notifId,
        peerId: peerRaw.replace(/^@+/, ''),
        peerName:
          peerName && !isPlaceholderActorValue(peerName)
            ? peerName
            : existing?.peerName || peerRaw,
        peerAvatar: peerAvatar || existing?.peerAvatar || '',
        lastMessage: lastMessage || existing?.lastMessage || 'Sent you a message',
        lastMessageAt: createdAt,
        isRead,
      });
    }
  });

  return Array.from(byPeer.values()).sort(
    (a, b) => (Date.parse(b.lastMessageAt) || 0) - (Date.parse(a.lastMessageAt) || 0),
  );
};

export const sendMastiBaseChatMessage = async (payload: {
  userId?: string;
  userName?: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  receiverId: string;
  receiverName?: string;
  receiverAvatar?: string;
  message: string;
  clientId?: string;
}) => {
  try {
    const senderId = String(payload.senderId || payload.userId || '').trim();
    const userId = String(payload.userId || senderId).trim();
    const senderName = String(payload.senderName || payload.userName || senderId).trim();
    const receiverId = String(payload.receiverId || '').trim();
    const body = {
      userId,
      userName: senderName,
      senderId,
      senderName,
      senderAvatar: payload.senderAvatar || '',
      receiverId,
      receiverName: payload.receiverName || '',
      receiverAvatar: payload.receiverAvatar || '',
      message: payload.message,
      ...(payload.clientId ? { clientId: payload.clientId } : {}),
    };
    const res = await fetch(`${API_BASE}/api/v1/social/chat/send`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        error: data?.error || data?.message || `HTTP ${res.status}`,
      };
    }
    return data || { success: true };
  } catch (err) {
    console.warn('[MastiBase API] Chat send failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Message send failed' };
  }
};

export const getMastiBaseChatConversation = async (user1: string, user2: string) => {
  const u1 = String(user1 || '').trim();
  const u2 = String(user2 || '').trim();
  if (!u1 || !u2) return [];
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/social/chat/conversation?user1=${encodeURIComponent(u1)}&user2=${encodeURIComponent(u2)}`,
      {
        headers: apiHeaders(),
      }
    );
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const rawList = Array.isArray(data?.messages)
      ? data.messages
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.data?.messages)
          ? data.data.messages
          : [];
    return rawList.map((m: any) => ({
      ...m,
      id: String(m?.id || m?.messageId || `${m?.senderId || 'u'}_${m?.createdAt || ''}_${String(m?.message || m?.text || '').slice(0, 12)}`),
      senderId: String(m?.senderId || m?.userId || ''),
      senderName: String(m?.senderName || m?.userName || ''),
      senderAvatar: normalizeMastiAvatarUrl(m?.senderAvatar || m?.userAvatar || ''),
      receiverId: String(m?.receiverId || m?.recipientId || ''),
      text: String(m?.text ?? m?.message ?? ''),
      message: String(m?.message ?? m?.text ?? ''),
      createdAt: String(m?.createdAt || m?.timestamp || new Date().toISOString()),
    }));
  } catch (err) {
    console.warn('[MastiBase API] Chat conversation fetch failed:', err);
  }
  return [];
};

export const initiateMastiBaseCall = async (payload: {
  receiverId: string;
  receiverName: string;
  callType: 'video' | 'audio';
}) => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/call`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[MastiBase API] Call initiate failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Call initiation failed' };
  }
};

export const sendMastiBaseCallSignal = async (payload: {
  senderId: string;
  receiverId: string;
  type: 'offer' | 'answer' | 'candidate';
  payload: any;
}) => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/call/signal`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[MastiBase API] Call signal send failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Signal send failed' };
  }
};

export const getMastiBaseCallSignals = async (myEmail: string) => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/call/signals/${encodeURIComponent(myEmail)}`, {
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (data && data.success && Array.isArray(data.signals)) {
      return data.signals;
    }
  } catch (err) {
    console.warn('[MastiBase API] Call signals fetch failed:', err);
  }
  return [];
};

export const updateMastiBaseCallStatus = async (payload: {
  callId: string;
  status: 'connected' | 'ended';
}) => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/social/call/status`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[MastiBase API] Call status update failed:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Status update failed' };
  }
};

export default {
  normalizeMastiAvatarUrl,
  normalizeMastiMediaUrl,
  normalizeMastiBaseActionResponse,
  getMastiBaseFeed,
  getMastiBaseComments,
  commentOnMastiBaseVideo,
  likeMastiBaseVideo,
  bookmarkMastiBaseVideo,
  shareMastiBaseVideo,
  deleteMastiBaseVideo,
  getMastiBaseBookmarks,
  getMastiBaseAdsConfig,
  getMastiBaseMonetization,
  requestMastiBasePayout,
  getMastiBaseNotifications,
  markMastiBaseNotificationRead,
  deleteMastiBaseNotifications,
  createMastiBaseNotification,
  followMastiBaseCreator,
  getMastiBaseProfile,
  lookupMastiBaseUser,
  syncMastiBaseUser,
  saveMastiBaseUidMapping,
  getCachedMastiBaseAliases,
  resolveMastiBaseOwnerAliases,
  searchMastiBase,
  uploadMastiBaseMedia,
  sendMastiBaseChatMessage,
  getMastiBaseChatConversation,
  getMastiBaseChatNotifications,
  initiateMastiBaseCall,
  sendMastiBaseCallSignal,
  getMastiBaseCallSignals,
  updateMastiBaseCallStatus,
  MASTER_CREATOR_ADMIN_EMAIL,
};
