// src/components/Toolbar.tsx
import React from 'react';

type ToolbarProps = {
  mode: "DRAW" | "SELECT";
  setMode: (mode: "DRAW" | "SELECT") => void;
  exportPathsToJson: () => void;
};

const Toolbar: React.FC<ToolbarProps> = ({ mode, setMode, exportPathsToJson }) => {
  return (
    <>
      <button
        onClick={exportPathsToJson}
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          padding: "8px 12px",
          backgroundColor: "#333",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Export to JSON
      </button>
      <div style={{ position: "absolute", top: 50, left: 10, zIndex: 1000 }}>
        <button
          onClick={() => setMode("DRAW")}
          style={{
            padding: "8px 12px",
            marginRight: "8px",
            backgroundColor: mode === "DRAW" ? "#555" : "#aaa",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Draw Mode
        </button>
        <button
          onClick={() => setMode("SELECT")}
          style={{
            padding: "8px 12px",
            backgroundColor: mode === "SELECT" ? "#555" : "#aaa",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Select Mode
        </button>
      </div>
    </>
  );
};

export default Toolbar;