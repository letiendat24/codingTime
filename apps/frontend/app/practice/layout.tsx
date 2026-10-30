import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Luyện Tập Thuật Toán & Kỹ Năng Lập Trình',
  description:
    'Rèn luyện kỹ năng giải thuật và tư duy lập trình với ngân hàng bài tập phong phú trên CodingTime. Hệ thống chấm điểm tự động và phản hồi tức thì.',
  openGraph: {
    title: 'Luyện Tập Thuật Toán & Kỹ Năng Lập Trình | CodingTime',
    description:
      'Thử thách bản thân với các bài tập thuật toán thực tế và hệ thống chấm điểm test case chuẩn xác.',
  },
  alternates: {
    canonical: '/practice',
  },
};

export default function PracticeLayout({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}
