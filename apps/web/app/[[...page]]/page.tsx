import { notFound } from 'next/navigation';
import { AtlasApp } from '../../components/atlas-app';
const pages = ['', 'trade', 'markets', 'portfolio', 'receipts', 'agent', 'system', 'judge'];
export default async function Page({ params }: { params: Promise<{ page?: string[] }> }) {
  const page = (await params).page?.join('/') ?? '';
  if (!pages.includes(page)) notFound();
  return <AtlasApp page={page} />;
}
