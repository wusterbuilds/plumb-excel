export interface FileEntry {
  name: string;
  path: string;
  kind: "file";
}

export interface FolderEntry {
  name: string;
  path: string;
  kind: "directory";
  children: FileTreeEntry[];
}

export type FileTreeEntry = FileEntry | FolderEntry;

export interface MentionItem {
  id: string;
  label: string;
  category: string;
  icon?: string;
  resolveContent: () => Promise<string>;
  resolveBuffer?: () => Promise<Uint8Array>;
}

export type PermissionStatus = "granted" | "prompt" | "denied" | "unknown";

export interface LocalFilesState {
  folderName: string | null;
  tree: FileTreeEntry[];
  loading: boolean;
  permissionStatus: PermissionStatus;
  supported: boolean;
  error: string | null;
}
