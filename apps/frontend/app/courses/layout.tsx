import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Khóa Học Lập Trình Thực Chiến',
  description:
    'Khám phá danh sách các khóa học lập trình thực chiến trên CodingTime. Học qua video code-along đồng bộ dòng code, thực hành tương tác và hoàn thành dự án.',
  openGraph: {
    title: 'Khóa Học Lập Trình Thực Chiến | CodingTime',
    description:
      'Học lập trình hiệu quả với video code-along đồng bộ dòng code và thực hành trực tiếp trong IDE.',
  },
  alternates: {
    canonical: '/courses',
  },
};

export default function CoursesLayout({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>;
}
