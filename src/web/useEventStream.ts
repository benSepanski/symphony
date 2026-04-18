import { useEffect, useRef, useState } from "react";

export type StreamStatus = "connecting" | "connected" | "disconnected";

export function useEventStream(
  eventNames: string[],
  onEvent: (name: string, data: unknown) => void | Promise<void>,
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const callback = useRef(onEvent);
  callback.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/api/events");
    const handlers = eventNames.map((name) => {
      const h = (ev: MessageEvent) => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          /* ignore malformed payloads */
        }
        void callback.current(name, parsed);
      };
      es.addEventListener(name, h as EventListener);
      return { name, h };
    });
    es.onopen = () => setStatus("connected");
    es.onerror = () => setStatus("disconnected");

    return () => {
      for (const { name, h } of handlers) {
        es.removeEventListener(name, h as EventListener);
      }
      es.close();
    };
  }, [eventNames.join("|")]);

  return status;
}
