import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Đăng Ký Tài Khoản',
  description: 'Tạo tài khoản CodingTime để khám phá các khóa học tương tác, workspace thực hành và hệ thống chấm điểm chuyên nghiệp.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function RegisterLayout({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}
