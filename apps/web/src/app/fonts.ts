import { Be_Vietnam_Pro, Playfair_Display } from 'next/font/google';

// Biến CSS khớp với `--font-display` / `--font-sans` trong @piano-daily/tokens.
export const playfairDisplay = Playfair_Display({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-playfair-display',
});

export const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-be-vietnam-pro',
});
