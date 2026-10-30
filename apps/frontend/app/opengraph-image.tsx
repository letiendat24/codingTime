import { ImageResponse } from 'next/og';

export const alt = 'CodingTime — Nền Tảng Học Lập Trình Thực Chiến';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          backgroundColor: '#090D16',
          backgroundImage:
            'radial-gradient(circle at 80% 20%, rgba(56, 189, 248, 0.15) 0%, transparent 40%), radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.15) 0%, transparent 40%)',
          padding: '80px',
          fontFamily: 'sans-serif',
          color: '#FFFFFF',
        }}
      >
        {/* Brand Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Logo Icon */}
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
              border: '2px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(56, 189, 248, 0.2)',
            }}
          >
            <span
              style={{
                fontSize: '28px',
                fontWeight: '900',
                letterSpacing: '-1px',
                background: 'linear-gradient(135deg, #38BDF8 0%, #818CF8 100%)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              &lt;/&gt;
            </span>
          </div>
          <span
            style={{
              fontSize: '36px',
              fontWeight: '800',
              letterSpacing: '-0.5px',
              color: '#FFFFFF',
            }}
          >
            CodingTime
          </span>
        </div>

        {/* Hero Title & Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '900px' }}>
          <h1
            style={{
              fontSize: '56px',
              fontWeight: '800',
              lineHeight: '1.15',
              letterSpacing: '-1.5px',
              margin: 0,
              background: 'linear-gradient(135deg, #FFFFFF 0%, #94A3B8 100%)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Nền Tảng Học Lập Trình Thực Chiến & Video Code-Along
          </h1>
          <p
            style={{
              fontSize: '24px',
              color: '#94A3B8',
              lineHeight: '1.4',
              margin: 0,
            }}
          >
            Đồng bộ video và code thời gian thực, thực hành trong workspace Monaco chuẩn chỉnh, tự động chấm thuật toán và dự án GitHub.
          </p>
        </div>

        {/* Feature Pills */}
        <div style={{ display: 'flex', gap: '14px' }}>
          {[
            '⚡ Video-Code Sync',
            '💻 Monaco Workspace',
            '🎯 Automated Judge',
            '🚀 Project Grading',
          ].map((pill) => (
            <div
              key={pill}
              style={{
                padding: '10px 22px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '18px',
                fontWeight: '600',
                color: '#E2E8F0',
              }}
            >
              {pill}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
