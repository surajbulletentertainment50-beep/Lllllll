export type MastiVideoQuality = '260p' | '360p' | '460p' | '720p' | '1080p';

export const MASTI_VIDEO_DEFAULT_QUALITY: MastiVideoQuality = '260p';

export const MASTI_VIDEO_QUALITY_OPTIONS = [
  {
    id: '260p' as MastiVideoQuality,
    quality: '260p' as MastiVideoQuality,
    title: 'Basic (260p)',
    label: '260p',
    description: 'Lowest data usage, starts instantly',
  },
  {
    id: '360p' as MastiVideoQuality,
    quality: '360p' as MastiVideoQuality,
    title: 'Data Saver (360p)',
    label: '360p',
    description: 'Fast loading on slow networks',
  },
  {
    id: '460p' as MastiVideoQuality,
    quality: '460p' as MastiVideoQuality,
    title: 'Standard (460p)',
    label: '460p',
    description: 'Balanced performance and quality',
  },
  {
    id: '720p' as MastiVideoQuality,
    quality: '720p' as MastiVideoQuality,
    title: 'High Definition (720p)',
    label: '720p',
    description: 'Clear and sharp visuals',
  },
  {
    id: '1080p' as MastiVideoQuality,
    quality: '1080p' as MastiVideoQuality,
    title: 'Full HD (1080p)',
    label: '1080p',
    description: 'Highest visual detail',
  },
];

export const getMastiVideoQualityStorageKey = (accountId?: string) =>
  `@masti_video_quality_${accountId || 'global'}`;

export const isMastiVideoQuality = (val: any): val is MastiVideoQuality =>
  ['260p', '360p', '460p', '720p', '1080p'].includes(String(val));

export const resolveMastiVideoQuality = (
  itemOrQuality: any,
  preferredQuality: MastiVideoQuality = '260p',
) => {
  let targetQuality: MastiVideoQuality = '260p';
  let item: any = null;
  if (typeof itemOrQuality === 'string' && isMastiVideoQuality(itemOrQuality)) {
    targetQuality = itemOrQuality;
  } else if (itemOrQuality && typeof itemOrQuality === 'object') {
    item = itemOrQuality;
    if (preferredQuality && isMastiVideoQuality(preferredQuality)) targetQuality = preferredQuality;
  }

  const originalUrl = item?.videoUrl || item?.url || item?.mediaUrl || '';
  if (!item) return { quality: targetQuality, url: originalUrl, source: 'original' };

  if (item.qualityUrls && typeof item.qualityUrls === 'object') {
    const directUrl = item.qualityUrls[targetQuality];
    if (directUrl && typeof directUrl === 'string') {
      return { quality: targetQuality, url: directUrl, source: 'transcode' };
    }
  }
  if (Array.isArray(item.qualities)) {
    const match = item.qualities.find((q: any) => q?.quality === targetQuality || q?.id === targetQuality);
    if (match?.url) return { quality: targetQuality, url: match.url, source: 'transcode' };
  }
  return { quality: targetQuality, url: originalUrl, source: 'original' };
};

export const getMastiBashQualityStreamUrl = (
  itemOrUrl: any,
  quality: MastiVideoQuality = '260p',
): string => {
  if (!itemOrUrl) return '';
  if (typeof itemOrUrl === 'string') return itemOrUrl;
  return resolveMastiVideoQuality(itemOrUrl, quality).url;
};
