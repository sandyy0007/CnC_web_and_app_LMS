import { PublicPage } from '@/components/public/site-chrome';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicPage>{children}</PublicPage>;
}
