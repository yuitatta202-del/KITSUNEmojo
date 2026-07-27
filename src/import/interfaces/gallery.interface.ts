// src/import/interfaces/gallery.interface.ts

export interface GalleryInfo {
  title: string;
  pages: number;
  images: string[];
  artist?: string;
  category?: string;
  tags?: string[];
  parodies?: string[];
  characters?: string[];
  groups?: string[];
}

export interface ImportResult {
  success: boolean;
  title?: string;
  id?: number;
  error?: string;
  warnings?: string[];
}

export interface BulkImportResult {
  success: boolean;
  processed: number;
  successful: number;
  failed: number;
  details: Array<ImportResult & { url: string }>;
}

// ✅ AGGIUNGI QUESTA INTERFACCIA
export interface BulkImportBody {
  urls: string[];
  delay?: number;
}
