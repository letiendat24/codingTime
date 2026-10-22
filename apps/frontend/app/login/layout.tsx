import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Đăng Nhập',
  description: 'Đăng nhập vào CodingTime để tiếp tục lộ trình học tập và rèn luyện kỹ năng lập trình của bạn.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginLayout({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}
