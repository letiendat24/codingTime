import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lịch Sử Học Tập',
  description: 'Xem lại toàn bộ lịch sử học tập, video đã xem và các cột mốc đã hoàn thành trên CodingTime.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function LearningHistoryLayout({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}
