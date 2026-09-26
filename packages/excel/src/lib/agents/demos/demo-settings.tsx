import { FlaskConical, Power, PowerOff } from "lucide-react";
import { useEffect, useState } from "react";
import { demoRegistry } from "./demo-registry";

export function DemoSettings() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return demoRegistry.subscribe(() => setTick((t) => t + 1));
  }, []);

  const scenarios = demoRegistry.list();
  const active = demoRegistry.getActive();

  if (scenarios.length === 0) return null;

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical size={12} className="text-(--chat-accent)" />
        <span className="text-xs font-medium text-(--chat-text-primary)">
          Demo Scenarios
        </span>
      </div>

      <p className="text-[11px] text-(--chat-text-muted) mb-3">
        Activate a demo scenario to switch to a purpose-built experience. The
        standard product is fully restored when deactivated.
      </p>

      <div className="flex flex-col gap-2">
        {scenarios.map((scenario) => {
          const isActive = active?.scenario.id === scenario.id;
          return (
            <div
              key={scenario.id}
              className={`p-3 border rounded-lg transition-colors ${
                isActive
                  ? "border-(--chat-accent) bg-(--chat-accent)/5"
                  : "border-(--chat-border) hover:bg-(--chat-bg-secondary)"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-(--chat-text-primary) flex-1">
                  {scenario.name}
                </span>
                {isActive ? (
                  <button
                    type="button"
                    onClick={() => demoRegistry.deactivate()}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                  >
                    <PowerOff size={10} />
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => demoRegistry.activate(scenario.id, false)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-(--chat-accent)/10 text-(--chat-accent) hover:bg-(--chat-accent)/20 transition-colors cursor-pointer"
                  >
                    <Power size={10} />
                    Activate
                  </button>
                )}
              </div>

              <p className="text-[11px] text-(--chat-text-muted)">
                {scenario.description}
              </p>

              {isActive && scenario.supportsHardcoded && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-(--chat-border)">
                  <span className="text-[10px] text-(--chat-text-muted)">
                    Mode:
                  </span>
                  <div className="flex rounded overflow-hidden border border-(--chat-border)">
                    <button
                      type="button"
                      onClick={() => demoRegistry.setHardcoded(false)}
                      className={`px-2 py-0.5 text-[10px] transition-colors cursor-pointer ${
                        !active.hardcoded
                          ? "bg-(--chat-accent) text-white"
                          : "bg-(--chat-bg) text-(--chat-text-muted) hover:bg-(--chat-bg-secondary)"
                      }`}
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => demoRegistry.setHardcoded(true)}
                      className={`px-2 py-0.5 text-[10px] transition-colors cursor-pointer ${
                        active.hardcoded
                          ? "bg-(--chat-accent) text-white"
                          : "bg-(--chat-bg) text-(--chat-text-muted) hover:bg-(--chat-bg-secondary)"
                      }`}
                    >
                      Hardcoded
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
