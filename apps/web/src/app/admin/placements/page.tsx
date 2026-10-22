import { redirect } from 'next/navigation';

export default function AdminPlacementsRedirect() {
  redirect('/admin/dashboard');
}
