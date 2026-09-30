/**
 * Dữ liệu mẫu khai báo (không logic) cho `prisma/seed.ts`.
 * Toàn bộ tên/bài đều là nhãn giả, không phải tác phẩm hay người thật.
 */

import type { CreateGenreRequest } from '@piano-daily/shared';

export type SeedLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

export interface SeedComposer {
  name: string;
  bio: string;
}

export interface SeedGenre {
  name: string;
  icon?: CreateGenreRequest['icon'];
}

export interface SeedSeries {
  name: string;
  composer: string;
}

export interface SeedSheet {
  title: string;
  composer: string;
  level: SeedLevel;
  genres: string[];
  series?: string;
  subtitle?: string;
  description: string;
  difficultyScore: number;
  youtubeUrl?: string;
  lyricsChords?: string;
  /** Số trang PDF (1–4). */
  pages: number;
  status: 'PUBLISHED' | 'DRAFT';
  isHot?: boolean;
}

export const SEED_COMPOSERS: SeedComposer[] = [
  { name: 'Mẫu Lan Anh', bio: 'Nhà soạn nhạc giả định, dùng cho dữ liệu mẫu.' },
  { name: 'Mẫu Bảo Long', bio: 'Nhà soạn nhạc giả định, dùng cho dữ liệu mẫu.' },
  { name: 'Mẫu Cẩm Tú', bio: 'Nhà soạn nhạc giả định, dùng cho dữ liệu mẫu.' },
  { name: 'Mẫu Đức Minh', bio: 'Nhà soạn nhạc giả định, dùng cho dữ liệu mẫu.' },
];

export const SEED_GENRES: SeedGenre[] = [
  { name: 'Cổ điển mẫu', icon: 'music' },
  { name: 'Pop mẫu', icon: 'mic-vocal' },
  { name: 'Jazz mẫu', icon: 'headphones' },
  { name: 'Thiếu nhi mẫu', icon: 'baby' },
];

export const SEED_SERIES: SeedSeries[] = [
  { name: 'Khởi đầu mẫu', composer: 'Mẫu Lan Anh' },
  { name: 'Đêm thu mẫu', composer: 'Mẫu Cẩm Tú' },
  { name: 'Bậc thầy mẫu', composer: 'Mẫu Đức Minh' },
];

const LYRICS = '[C]Đây là lời mẫu [G]dòng một\n[Am]Đây là lời mẫu [F]dòng hai\n';

export const SEED_SHEETS: SeedSheet[] = [
  // BEGINNER (3)
  {
    title: 'Bài tập ngón số 1 (mẫu)',
    composer: 'Mẫu Lan Anh',
    level: 'BEGINNER',
    genres: ['Thiếu nhi mẫu'],
    series: 'Khởi đầu mẫu',
    description: 'Bài tập năm ngón cho người mới bắt đầu.',
    difficultyScore: 10,
    pages: 1,
    status: 'PUBLISHED',
    isHot: true,
  },
  {
    title: 'Ru ngủ mẫu',
    composer: 'Mẫu Lan Anh',
    level: 'BEGINNER',
    genres: ['Thiếu nhi mẫu', 'Cổ điển mẫu'],
    series: 'Khởi đầu mẫu',
    description: 'Giai điệu chậm, tay phải là chính.',
    difficultyScore: 15,
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    pages: 1,
    status: 'PUBLISHED',
  },
  {
    title: 'Nắng sớm mẫu',
    composer: 'Mẫu Bảo Long',
    level: 'BEGINNER',
    genres: ['Pop mẫu'],
    description: 'Ca khúc pop giả định, hợp âm cơ bản.',
    difficultyScore: 20,
    lyricsChords: LYRICS,
    pages: 2,
    status: 'DRAFT',
  },
  // INTERMEDIATE (3)
  {
    title: 'Đêm thu mẫu số 1',
    composer: 'Mẫu Cẩm Tú',
    level: 'INTERMEDIATE',
    genres: ['Cổ điển mẫu'],
    series: 'Đêm thu mẫu',
    description: 'Nocturne giả định cho tay trái rải hợp âm.',
    difficultyScore: 45,
    pages: 3,
    status: 'PUBLISHED',
    isHot: true,
  },
  {
    title: 'Phố nhỏ mẫu',
    composer: 'Mẫu Bảo Long',
    level: 'INTERMEDIATE',
    genres: ['Pop mẫu'],
    subtitle: 'Bản piano solo',
    description: 'Ballad giả định, có lời và hợp âm.',
    difficultyScore: 50,
    youtubeUrl: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
    lyricsChords: LYRICS,
    pages: 2,
    status: 'PUBLISHED',
  },
  {
    title: 'Đêm thu mẫu số 2',
    composer: 'Mẫu Cẩm Tú',
    level: 'INTERMEDIATE',
    genres: ['Cổ điển mẫu', 'Jazz mẫu'],
    series: 'Đêm thu mẫu',
    description: 'Nocturne giả định thứ hai, nhịp 6/8.',
    difficultyScore: 55,
    pages: 3,
    status: 'PUBLISHED',
  },
  // ADVANCED (2)
  {
    title: 'Swing khuya mẫu',
    composer: 'Mẫu Đức Minh',
    level: 'ADVANCED',
    genres: ['Jazz mẫu'],
    series: 'Bậc thầy mẫu',
    description: 'Jazz giả định, nhịp swing và hợp âm mở rộng.',
    difficultyScore: 70,
    pages: 4,
    status: 'PUBLISHED',
  },
  {
    title: 'Biến tấu mẫu',
    composer: 'Mẫu Đức Minh',
    level: 'ADVANCED',
    genres: ['Cổ điển mẫu'],
    series: 'Bậc thầy mẫu',
    description: 'Chủ đề và biến tấu giả định.',
    difficultyScore: 75,
    pages: 4,
    status: 'DRAFT',
  },
  // EXPERT (2)
  {
    title: 'Toccata mẫu',
    composer: 'Mẫu Đức Minh',
    level: 'EXPERT',
    genres: ['Cổ điển mẫu'],
    description: 'Toccata giả định, kỹ thuật nhanh cả hai tay.',
    difficultyScore: 90,
    pages: 4,
    status: 'PUBLISHED',
  },
  {
    title: 'Ảo ảnh mẫu',
    composer: 'Mẫu Bảo Long',
    level: 'EXPERT',
    genres: ['Cổ điển mẫu', 'Jazz mẫu'],
    description: 'Tác phẩm giả định, đổi nhịp liên tục.',
    difficultyScore: 95,
    youtubeUrl: 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
    pages: 4,
    status: 'PUBLISHED',
  },
];
