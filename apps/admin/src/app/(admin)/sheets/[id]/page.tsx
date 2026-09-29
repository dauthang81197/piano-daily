'use client';

import { use } from 'react';
import { SheetEditPage } from '@/components/sheets/sheet-editor';

export default function EditSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SheetEditPage id={id} />;
}
