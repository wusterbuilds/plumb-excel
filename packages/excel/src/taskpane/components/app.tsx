import { ChatInterface, ErrorBoundary } from "@office-agents/core";
import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPlumbAdapter } from "../../lib/adapter";
import { demoRegistry } from "../../lib/agents/demos/demo-registry";
import { registerProformaReviewAgent } from "../../lib/agents/proforma-review/agent";
import { agentRegistry } from "../../lib/agents/registry";
import "../../lib/agents/demos/document-audit";

registerProformaReviewAgent();
demoRegistry.restoreFromStorage();

interface AppProps {
  title: string;
}

const App: FC<AppProps> = () => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub1 = agentRegistry.subscribe(() => setTick((t) => t + 1));
    const unsub2 = demoRegistry.subscribe(() => setTick((t) => t + 1));
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick triggers adapter re-creation on agent/demo switch
  const adapter = useMemo(() => createPlumbAdapter(), [tick]);

  return (
    <ErrorBoundary>
      <div className="h-screen w-full overflow-hidden flex flex-col">
        <div
          className="flex items-center px-3 shrink-0"
          style={{
            borderBottom: "1px solid var(--chat-border)",
            backgroundColor: "var(--chat-bg)",
            height: "36px",
          }}
        >
          <img
            src="/assets/logo-transparent.png"
            alt="Plumb"
            className="dark:invert"
            style={{ height: "20px", width: "auto" }}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatInterface adapter={adapter} />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
