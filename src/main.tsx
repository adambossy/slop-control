import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles/main.css";

function ResizableTwoColumnLayout(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<boolean>(false);
  const [leftPercentage, setLeftPercentage] = useState<number>(50);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent): void {
      if (!draggingRef.current || !containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const pct = (offsetX / rect.width) * 100;
      const clamped = Math.max(10, Math.min(90, pct));
      setLeftPercentage(clamped);
      event.preventDefault();
    }

    function handleMouseUp(): void {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      document.body.style.cursor = "";
      (document.body.style as any).userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    (document.body.style as any).userSelect = "none";
    event.preventDefault();
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <div style={{ padding: 16, borderBottom: "1px solid #e5e5e5" }} />

      <div
        ref={containerRef}
        style={{
          display: "grid",
          gridTemplateColumns: `${leftPercentage}% 4px ${100 - leftPercentage}%`,
          gap: 0,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            padding: 16,
            overflow: "auto",
            borderRight: "1px solid #f0f0f0",
          }}
        />

        <div
          onMouseDown={handleMouseDown}
          style={{
            cursor: "col-resize",
            background: "#f5f5f5",
            borderLeft: "1px solid #eaeaea",
            borderRight: "1px solid #eaeaea",
          }}
        />

        <div style={{ padding: 16, overflow: "auto" }} />
      </div>
    </div>
  );
}

const rootElement = document.getElementById("app");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ResizableTwoColumnLayout />
    </React.StrictMode>,
  );
}
