'use client';

import type { Composer, Genre, Series } from '@piano-daily/shared';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { composersApi, genresApi, seriesApi } from '@/lib/api/catalog';
import { ComposerForm } from './composer-form';
import { GenreIconView } from './genre-icons';
import { GenreForm } from './genre-form';
import { SeriesForm } from './series-form';
import { type Column, TaxonomyTable } from './taxonomy-table';
import { useComposerOptions } from './use-composer-options';

const slugColumn = { header: 'Slug', cell: (item: { slug: string }) => <code className="text-caption">{item.slug}</code> };

const COMPOSER_COLUMNS: Column<Composer>[] = [
  { header: 'Tên', cell: (c) => c.name, className: 'font-medium' },
  slugColumn,
  { header: 'Số Series', cell: (c) => c.seriesCount, className: 'text-right' },
];

const GENRE_COLUMNS: Column<Genre>[] = [
  { header: 'Tên', cell: (g) => g.name, className: 'font-medium' },
  slugColumn,
  { header: 'Icon', cell: (g) => <GenreIconView icon={g.icon} /> },
];

const SERIES_COLUMNS: Column<Series>[] = [
  { header: 'Tên', cell: (s) => s.name, className: 'font-medium' },
  slugColumn,
  { header: 'Composer', cell: (s) => s.composer.name },
];

const ALL_COMPOSERS = 'all';

export function ComposersTab() {
  return (
    <TaxonomyTable
      entity="Composer"
      columns={COMPOSER_COLUMNS}
      load={composersApi.list}
      renderForm={(props) => <ComposerForm {...props} />}
    />
  );
}

export function GenresTab() {
  return (
    <TaxonomyTable
      entity="Genre"
      columns={GENRE_COLUMNS}
      load={genresApi.list}
      renderForm={(props) => <GenreForm {...props} />}
    />
  );
}

export function SeriesTab() {
  const [composerId, setComposerId] = useState(ALL_COMPOSERS);
  const composers = useComposerOptions();
  const items = [{ value: ALL_COMPOSERS, label: 'Tất cả Composer' }, ...composers.options];

  return (
    <TaxonomyTable
      entity="Series"
      columns={SERIES_COLUMNS}
      load={seriesApi.list}
      filter={composerId === ALL_COMPOSERS ? {} : { composerId }}
      toolbar={
        <div className="flex items-center gap-2">
          <Label htmlFor="series-filter-composer">Composer</Label>
          <Select items={items} value={composerId} onValueChange={(value) => setComposerId(value ?? ALL_COMPOSERS)}>
            <SelectTrigger id="series-filter-composer" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      renderForm={(props) => <SeriesForm {...props} />}
    />
  );
}

/** Ba tab Composer / Genre / Series. Mỗi tab chỉ mount (và tải dữ liệu) khi đang mở. */
export function TaxonomyTabs() {
  return (
    <Tabs defaultValue="composers">
      <TabsList>
        <TabsTrigger value="composers">Composer</TabsTrigger>
        <TabsTrigger value="genres">Genre</TabsTrigger>
        <TabsTrigger value="series">Series</TabsTrigger>
      </TabsList>
      <TabsContent value="composers" className="pt-4">
        <ComposersTab />
      </TabsContent>
      <TabsContent value="genres" className="pt-4">
        <GenresTab />
      </TabsContent>
      <TabsContent value="series" className="pt-4">
        <SeriesTab />
      </TabsContent>
    </Tabs>
  );
}
