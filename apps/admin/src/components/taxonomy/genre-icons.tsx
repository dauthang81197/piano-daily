import type { GenreIcon } from '@piano-daily/shared';
import {
  Baby,
  BookOpen,
  Church,
  Coffee,
  Crown,
  Disc3,
  Drum,
  Film,
  Flame,
  Gamepad2,
  Gift,
  Guitar,
  Headphones,
  Heart,
  Leaf,
  type LucideIcon,
  MicVocal,
  Moon,
  Music,
  PartyPopper,
  Piano,
  Snowflake,
  Sparkles,
  Star,
  Sun,
} from 'lucide-react';

/** Component lucide cho mỗi tên trong `GENRE_ICONS` (Record bắt buộc đủ mọi tên). */
export const GENRE_ICON_COMPONENTS: Record<GenreIcon, LucideIcon> = {
  music: Music,
  piano: Piano,
  guitar: Guitar,
  drum: Drum,
  'mic-vocal': MicVocal,
  headphones: Headphones,
  'disc-3': Disc3,
  heart: Heart,
  star: Star,
  sparkles: Sparkles,
  crown: Crown,
  film: Film,
  'gamepad-2': Gamepad2,
  church: Church,
  baby: Baby,
  sun: Sun,
  moon: Moon,
  coffee: Coffee,
  leaf: Leaf,
  flame: Flame,
  snowflake: Snowflake,
  'party-popper': PartyPopper,
  gift: Gift,
  'book-open': BookOpen,
};

export function GenreIconView({ icon }: { icon: GenreIcon | null }) {
  if (!icon) return <span className="text-muted-foreground">—</span>;
  const Icon = (GENRE_ICON_COMPONENTS as Partial<Record<string, LucideIcon>>)[icon];
  if (!Icon) return <span>{icon}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Icon aria-hidden="true" className="size-4" />
      <span>{icon}</span>
    </span>
  );
}
