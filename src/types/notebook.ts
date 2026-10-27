export type NotebookFileType = 'pdf' | 'ppt' | 'pptx' | 'doc' | 'txt' | 'other';

export interface NotebookFile {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  type: NotebookFileType;
  uploadedAt: number;
  pageCount?: string;
  downloadUrl?: string;
  storagePath?: string;
  summary?: string;
}

export interface AttachedPage {
  id: string;
  fileId: string;
  fileName: string;
  fileType: NotebookFileType;
  pageNum: number;
  totalPages: number;
  previewUrl?: string;
  imageDataUrl?: string; // Base64 JPEG data URL of the rendered page for AI vision
  extractedText?: string; // Text content extracted from the page
  addedAt: number;
}

export type NotebookType = 'folder' | 'pdf' | 'ppt' | 'blank';

export interface NotebookItem {
  id: string;
  title: string;
  description?: string;
  coverColor: string;
  createdAt: number;
  updatedAt: number;
  files: NotebookFile[];
  tags?: string[];
  // Legacy optional fields for backward compatibility
  type?: NotebookType;
  fileName?: string;
  fileSize?: string;
  pageCount?: string;
  summary?: string;
}
