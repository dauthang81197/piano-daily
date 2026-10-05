import type { GenreIcon as GenreIconName } from '@piano-daily/shared';
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

/** Component lucide cho mỗi tên trong `GENRE_ICONS` (Record bắt buộc đủ mọi tên; import theo tên, không kéo cả bộ icon). */
const ICONS: Record<GenreIconName, LucideIcon> = {
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

/** Icon trang trí của Genre; `null` hoặc tên lạ thì không hiện gì. */
export function GenreIcon({ icon, className }: { icon: string | null; className?: string }) {
  const Icon = icon && Object.hasOwn(ICONS, icon) ? ICONS[icon as GenreIconName] : undefined;
  return Icon ? <Icon aria-hidden="true" className={className} /> : null;
}
