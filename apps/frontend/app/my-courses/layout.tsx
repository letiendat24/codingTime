import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Khóa Học Của Tôi',
  description: 'Quản lý các khóa học bạn đã đăng ký và theo dõi tiến độ học tập trên CodingTime.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function MyCoursesLayout({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}
