import React from "react";
import type { LearningStatus } from "@shared/types";

interface StatusBarProps {
  profileName: string;
  learningStatus: LearningStatus;
  lastCapture: string | null;
  stats: {
    stateCount: number;
    factCount: number;
    annotationCount: number;
  };
  onToggleLearning: () => void;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  return date.toLocaleTimeString();
}

const STATUS_LABELS: Record<LearningStatus, string> = {
  active: "Learning",
  paused: "Paused",
  off: "Off",
};

const STATUS_CLASSES: Record<LearningStatus, string> = {
  active: "status-active",
  paused: "status-paused",
  off: "status-off",
};

export function StatusBar({
  profileName,
  learningStatus,
  lastCapture,
  stats,
  onToggleLearning,
}: StatusBarProps): React.JSX.Element {
  return (
    <div className="status-panel">
      <div className="status-section">
        <h3 className="status-heading">Active Profile</h3>
        <p className="status-value">{profileName}</p>
      </div>

      <div className="status-section">
        <h3 className="status-heading">Learning</h3>
        <div className="status-row">
          <span className={`status-badge ${STATUS_CLASSES[learningStatus]}`}>
            {STATUS_LABELS[learningStatus]}
          </span>
          <button className="toggle-btn" onClick={onToggleLearning}>
            {learningStatus === "active" ? "Pause" : "Start"}
          </button>
        </div>
      </div>

      <div className="status-section">
        <h3 className="status-heading">Last Capture</h3>
        <p className="status-value">{formatTimestamp(lastCapture)}</p>
      </div>

      <div className="status-section">
        <h3 className="status-heading">Knowledge Base</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-number">{stats.stateCount}</span>
            <span className="stat-label">States</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{stats.factCount}</span>
            <span className="stat-label">Facts</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{stats.annotationCount}</span>
            <span className="stat-label">Notes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
