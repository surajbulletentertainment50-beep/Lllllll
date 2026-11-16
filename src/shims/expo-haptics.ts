export const ImpactFeedbackStyle = {
  Light: 'light',
  Medium: 'medium',
  Heavy: 'heavy',
} as const;

export const impactAsync = async (_style?: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(15);
    } catch {}
  }
};

export const selectionAsync = async (): Promise<void> => {
  await impactAsync(ImpactFeedbackStyle.Light);
};

export default { ImpactFeedbackStyle, impactAsync, selectionAsync };
