import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '绕组工作台 · Winding Studio',
  description:
    '从槽极参数生成电机绕组展开图、电气连接图，验证三相电势、并联支路及绕组系数。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
