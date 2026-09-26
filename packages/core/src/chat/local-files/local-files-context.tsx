import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  buildNativeTree,
  clearAllData,
  flattenFiles,
  hasNativeFSAccess,
  importFolderFromFiles,
  loadFileContent,
  loadFolderMeta,
  loadHandle,
  persistHandle,
  pickNativeDirectory,
  queryPermission,
  readNativeFile,
  readNativeFileBuffer,
  requestPermission,
} from "./fs-store";
import {
  checkServerHealth,
  fetchFile,
  fetchFileBuffer,
  fetchTree,
} from "./server-client";
import type { LocalFilesState, MentionItem, PermissionStatus } from "./types";

type AccessMode = "native" | "fallback" | "server";

const SERVER_URL_KEY = "office-agents-file-server-url";
const ROOT_PATH_KEY = "office-agents-file-server-root";

export function getServerConfig(): {
  serverUrl: string;
  rootPath: string;
} {
  return {
    serverUrl: localStorage.getItem(SERVER_URL_KEY) || "https://localhost:3456",
    rootPath: localStorage.getItem(ROOT_PATH_KEY) || "",
  };
}

export function setServerConfig(serverUrl: string, rootPath: string): void {
  localStorage.setItem(SERVER_URL_KEY, serverUrl);
  localStorage.setItem(ROOT_PATH_KEY, rootPath);
}

export function clearServerConfig(): void {
  localStorage.removeItem(SERVER_URL_KEY);
  localStorage.removeItem(ROOT_PATH_KEY);
}

interface LocalFilesContextValue {
  state: LocalFilesState;
  setMasterFolder: () => void;
  removeMasterFolder: () => Promise<void>;
  reauthorize: () => void;
  refreshTree: () => void;
  readFile: (path: string) => Promise<string>;
  getFileMentionItems: () => MentionItem[];
  importFiles: (files: File[]) => Promise<void>;
  connectToServer: (serverUrl: string, rootPath: string) => Promise<void>;
  serverConnected: boolean;
}

const LocalFilesContext = createContext<LocalFilesContextValue | null>(null);

export function LocalFilesProvider({ children }: { children: ReactNode }) {
  const nativeSupported = hasNativeFSAccess();
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const modeRef = useRef<AccessMode>(nativeSupported ? "native" : "fallback");
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const serverUrlRef = useRef<string>("");
  const rootPathRef = useRef<string>("");

  const [serverConnected, setServerConnected] = useState(false);

  const setFolderInputRef = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
  }, []);

  const [state, setState] = useState<LocalFilesState>({
    folderName: null,
    tree: [],
    loading: false,
    permissionStatus: "unknown",
    supported: true,
    error: null,
  });

  const loadNativeTree = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const tree = await buildNativeTree(handle);
        setState((s) => ({
          ...s,
          tree,
          folderName: handle.name,
          loading: false,
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to read folder",
        }));
      }
    },
    [],
  );

  const loadServerTree = useCallback(
    async (serverUrl: string, rootPath: string) => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { folderName, tree } = await fetchTree(serverUrl, rootPath);
        modeRef.current = "server";
        serverUrlRef.current = serverUrl;
        rootPathRef.current = rootPath;
        setServerConnected(true);
        setState((s) => ({
          ...s,
          folderName,
          tree,
          loading: false,
          permissionStatus: "granted" as PermissionStatus,
          error: null,
        }));
      } catch (err) {
        setServerConnected(false);
        setState((s) => ({
          ...s,
          loading: false,
          error:
            err instanceof Error ? err.message : "Failed to connect to server",
        }));
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { serverUrl, rootPath } = getServerConfig();
        if (serverUrl && rootPath) {
          const healthy = await checkServerHealth(serverUrl);
          if (cancelled) return;
          if (healthy) {
            await loadServerTree(serverUrl, rootPath);
            return;
          }
        }

        if (nativeSupported) {
          const handle = await loadHandle();
          if (!handle || cancelled) return;
          const perm = await queryPermission(handle);
          if (cancelled) return;
          handleRef.current = handle;
          modeRef.current = "native";
          setState((s) => ({
            ...s,
            folderName: handle.name,
            permissionStatus: perm,
          }));
          if (perm === "granted") {
            await loadNativeTree(handle);
          }
        } else {
          const meta = await loadFolderMeta();
          if (!meta || cancelled) return;
          modeRef.current = "fallback";
          setState((s) => ({
            ...s,
            folderName: meta.folderName,
            tree: meta.tree,
            permissionStatus: "granted" as PermissionStatus,
          }));
        }
      } catch {
        // storage may be unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nativeSupported, loadNativeTree, loadServerTree]);

  const connectToServer = useCallback(
    async (serverUrl: string, rootPath: string) => {
      setServerConfig(serverUrl, rootPath);
      await clearAllData();
      await loadServerTree(serverUrl, rootPath);
    },
    [loadServerTree],
  );

  const importFiles = useCallback(async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { folderName, tree } = await importFolderFromFiles(fileList);
      modeRef.current = "fallback";
      setState((s) => ({
        ...s,
        folderName,
        tree,
        loading: false,
        permissionStatus: "granted" as PermissionStatus,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to import files",
      }));
    }
  }, []);

  const handleFolderSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      await importFiles(Array.from(files));
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
    },
    [importFiles],
  );

  const setMasterFolder = useCallback(async () => {
    if (nativeSupported) {
      try {
        const handle = await pickNativeDirectory();
        handleRef.current = handle;
        modeRef.current = "native";
        await persistHandle(handle);
        setState((s) => ({
          ...s,
          folderName: handle.name,
          permissionStatus: "granted" as PermissionStatus,
          error: null,
        }));
        await loadNativeTree(handle);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : "Failed to pick folder",
        }));
      }
    } else {
      folderInputRef.current?.click();
    }
  }, [nativeSupported, loadNativeTree]);

  const removeMasterFolder = useCallback(async () => {
    handleRef.current = null;
    serverUrlRef.current = "";
    rootPathRef.current = "";
    clearServerConfig();
    setServerConnected(false);
    await clearAllData();
    setState((s) => ({
      ...s,
      folderName: null,
      tree: [],
      permissionStatus: "unknown",
      error: null,
    }));
  }, []);

  const reauthorize = useCallback(async () => {
    if (modeRef.current === "server") {
      await loadServerTree(serverUrlRef.current, rootPathRef.current);
    } else if (modeRef.current === "native") {
      const handle = handleRef.current;
      if (!handle) return;
      const perm = await requestPermission(handle);
      setState((s) => ({ ...s, permissionStatus: perm }));
      if (perm === "granted") {
        await loadNativeTree(handle);
      }
    } else {
      setMasterFolder();
    }
  }, [loadNativeTree, loadServerTree, setMasterFolder]);

  const refreshTree = useCallback(async () => {
    if (modeRef.current === "server") {
      await loadServerTree(serverUrlRef.current, rootPathRef.current);
    } else if (modeRef.current === "native") {
      const handle = handleRef.current;
      if (!handle) return;
      await loadNativeTree(handle);
    } else {
      setMasterFolder();
    }
  }, [loadNativeTree, loadServerTree, setMasterFolder]);

  const readFile = useCallback(async (path: string): Promise<string> => {
    if (modeRef.current === "server") {
      return fetchFile(serverUrlRef.current, rootPathRef.current, path);
    }
    if (modeRef.current === "native") {
      const handle = handleRef.current;
      if (!handle) throw new Error("No master folder configured");
      return readNativeFile(handle, path);
    }
    const content = await loadFileContent(path);
    if (content === null) throw new Error(`File not found: ${path}`);
    return content;
  }, []);

  const getFileMentionItems = useCallback((): MentionItem[] => {
    const files = flattenFiles(state.tree).filter((e) => e.kind === "file");
    return files.map(
      (f): MentionItem => ({
        id: `file:${f.path}`,
        label: f.name,
        category: "Files",
        resolveContent: async () => {
          if (modeRef.current === "server") {
            return fetchFile(serverUrlRef.current, rootPathRef.current, f.path);
          }
          if (modeRef.current === "native") {
            const handle = handleRef.current;
            if (!handle) throw new Error("No folder configured");
            return readNativeFile(handle, f.path);
          }
          const content = await loadFileContent(f.path);
          if (content === null) throw new Error(`File not found: ${f.path}`);
          return content;
        },
        resolveBuffer: async () => {
          if (modeRef.current === "server") {
            return fetchFileBuffer(
              serverUrlRef.current,
              rootPathRef.current,
              f.path,
            );
          }
          if (modeRef.current === "native") {
            const handle = handleRef.current;
            if (!handle) throw new Error("No folder configured");
            return readNativeFileBuffer(handle, f.path);
          }
          const content = await loadFileContent(f.path);
          if (content === null) throw new Error(`File not found: ${f.path}`);
          return new TextEncoder().encode(content);
        },
      }),
    );
  }, [state.tree]);

  return (
    <LocalFilesContext.Provider
      value={{
        state,
        setMasterFolder,
        removeMasterFolder,
        reauthorize,
        refreshTree,
        readFile,
        getFileMentionItems,
        importFiles,
        connectToServer,
        serverConnected,
      }}
    >
      {children}
      <input
        ref={setFolderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderSelect}
      />
    </LocalFilesContext.Provider>
  );
}

export function useLocalFiles() {
  const ctx = useContext(LocalFilesContext);
  if (!ctx)
    throw new Error("useLocalFiles must be used within LocalFilesProvider");
  return ctx;
}
