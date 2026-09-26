import { Check, ChevronLeft, Loader2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { DemoSettings } from "../agents/demos/demo-settings";
import { MOCK_CONNECTORS } from "./mock-catalog";
import type { ConnectedSource, ConnectorInfo } from "./types";

const STORAGE_KEY = "plumb-connected-sources";

function loadConnectedSources(): ConnectedSource[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConnectedSources(sources: ConnectedSource[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

function ConnectorCard({
  connector,
  isConnected,
  onConnect,
  onDisconnect,
}: {
  connector: ConnectorInfo;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 border border-(--chat-border) rounded-lg hover:bg-(--chat-bg-secondary) transition-colors">
      <div className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shrink-0 overflow-hidden p-1.5">
        <span className="text-[9px] font-semibold text-black">DEMO</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-(--chat-text-primary) truncate">
            {connector.name}
          </span>
        </div>
        <p className="text-[11px] text-(--chat-text-muted) truncate">
          {connector.description}
        </p>
      </div>
      <div className="shrink-0">
        {isConnected ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-green-500/10 text-green-500 hover:bg-red-500/10 hover:text-red-500 transition-colors group"
          >
            <Check size={12} className="group-hover:hidden" />
            <X size={12} className="hidden group-hover:block" />
            <span className="group-hover:hidden">Connected</span>
            <span className="hidden group-hover:block">Disconnect</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="px-3 py-1.5 text-xs rounded-md transition-colors bg-(--chat-accent) text-white hover:opacity-90"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

function CredentialForm({
  connector,
  onSubmit,
  onCancel,
}: {
  connector: ConnectorInfo;
  onSubmit: (credentials: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsConnecting(true);
      // Simulate connection delay for demo
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setIsConnecting(false);
      onSubmit(values);
    },
    [values, onSubmit],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-(--chat-border)">
        <button
          type="button"
          onClick={onCancel}
          className="p-1 text-(--chat-text-muted) hover:text-(--chat-text-primary) transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="w-8 h-8 flex items-center justify-center bg-white rounded-md overflow-hidden p-1 shrink-0">
          <span className="text-[9px] font-semibold text-black">DEMO</span>
        </div>
        <div>
          <h3 className="text-sm font-medium text-(--chat-text-primary)">
            Enable {connector.name}
          </h3>
          <p className="text-[11px] text-(--chat-text-muted)">
            No credentials or external account required
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 flex-1">
        {connector.authFields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1">
            <label
              htmlFor={field.name}
              className="text-xs text-(--chat-text-secondary)"
            >
              {field.label}
            </label>
            <input
              id={field.name}
              type={field.type}
              placeholder={field.placeholder}
              value={values[field.name] || ""}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [field.name]: e.target.value,
                }))
              }
              className="px-3 py-2 text-sm border border-(--chat-border) rounded-md bg-(--chat-bg) text-(--chat-text-primary) placeholder:text-(--chat-text-muted) focus:outline-none focus:border-(--chat-accent)"
            />
          </div>
        ))}

        <div className="flex-1" />

        <button
          type="submit"
          disabled={
            isConnecting ||
            connector.authFields.some((f) => !values[f.name]?.trim())
          }
          className="w-full py-2.5 text-sm font-medium rounded-md bg-(--chat-accent) text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
        >
          {isConnecting ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Connecting...
            </>
          ) : (
            `Enable ${connector.name}`
          )}
        </button>

        <p className="text-[10px] text-(--chat-text-muted) text-center">
          This uses synthetic local fixtures and does not contact a third party.
        </p>
      </form>
    </div>
  );
}

export function ConnectDataTab() {
  const [connectedSources, setConnectedSources] =
    useState<ConnectedSource[]>(loadConnectedSources);
  const [connectingTo, setConnectingTo] = useState<ConnectorInfo | null>(null);

  const connectedIds = new Set(
    connectedSources.filter((s) => s.enabled).map((s) => s.connectorId),
  );

  const handleConnect = useCallback(
    (connector: ConnectorInfo, _credentials: Record<string, string>) => {
      const newSource: ConnectedSource = {
        connectorId: connector.id,
        connectionId: `mock-${connector.id}-${Date.now()}`,
        displayName: connector.name,
        connectedAt: Date.now(),
        enabled: true,
      };
      const updated = [
        ...connectedSources.filter((s) => s.connectorId !== connector.id),
        newSource,
      ];
      setConnectedSources(updated);
      saveConnectedSources(updated);
      setConnectingTo(null);
    },
    [connectedSources],
  );

  const handleDisconnect = useCallback(
    (connectorId: string) => {
      const updated = connectedSources.filter(
        (s) => s.connectorId !== connectorId,
      );
      setConnectedSources(updated);
      saveConnectedSources(updated);
    },
    [connectedSources],
  );

  if (connectingTo) {
    return (
      <CredentialForm
        connector={connectingTo}
        onSubmit={(creds) => handleConnect(connectingTo, creds)}
        onCancel={() => setConnectingTo(null)}
      />
    );
  }

  return (
    <div className="pt-2">
      <p className="text-[11px] text-(--chat-text-muted) mb-3">
        Enable simulated data sources to explore the audit workflow. These demos
        do not connect to external platforms or use live market data.
      </p>

      {connectedSources.length > 0 && (
        <div className="pb-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-(--chat-text-secondary)">
              {connectedSources.length} connected
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 pb-3">
        {MOCK_CONNECTORS.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            isConnected={connectedIds.has(connector.id)}
            onConnect={() => setConnectingTo(connector)}
            onDisconnect={() => handleDisconnect(connector.id)}
          />
        ))}
      </div>

      <p className="text-[10px] text-(--chat-text-muted) text-center pt-2">
        Need a platform not listed here?{" "}
        <a
          href="mailto:support@plumb.ai"
          className="text-(--chat-accent) hover:underline"
        >
          Suggest an integration
        </a>
      </p>

      <div className="border-t border-(--chat-border) mt-4">
        <DemoSettings />
      </div>
    </div>
  );
}
