export const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export type LevelSlug = (typeof LEVELS)[number];
