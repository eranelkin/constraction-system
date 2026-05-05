export interface MediaFile {
  id: string;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSecs: number | null;
  uploadedBy: string;
  uploaderName: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
}
