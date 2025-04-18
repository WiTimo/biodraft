import React from "react";
export type Mode = "edit" | "select" | "link";

interface ToolbarProps {
    mode: Mode;
    setMode: (m: Mode) => void;
    exportJson: () => void;
}

export default function Toolbar({ mode, setMode, exportJson }: ToolbarProps) {
    return (
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 10 }}>
            <button
                onClick={() => setMode("edit")}
                style={{ fontWeight: mode === "edit" ? "bold" : "normal", marginRight: 8 }}
            >
                Draw
            </button>
            <button
                onClick={() => setMode("select")}
                style={{ fontWeight: mode === "select" ? "bold" : "normal", marginRight: 8 }}
            >
                Select
            </button>
            <button
                onClick={() => setMode("link")}
                style={{ fontWeight: mode === "link" ? "bold" : "normal", marginRight: 8 }}
            >
                Link
            </button>
            <button onClick={exportJson} style={{ marginLeft: 16 }}>
                Export JSON
            </button>
        </div>
    );
}
