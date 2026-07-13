import React, { useReducer, useEffect, useCallback } from "react";
import type {
  OverlayView,
  LearningStatus,
  Message,
  Fact,
  Annotation,
} from "@shared/types";
import { ChatPanel } from "./components/ChatPanel";
import { StatusBar } from "./components/StatusBar";
import { MemoryPanel } from "./components/MemoryPanel";

interface AppState {
  activeView: OverlayView;
  profileId: string | null;
  profileName: string;
  learningStatus: LearningStatus;
  conversationHistory: Message[];
  isLoading: boolean;
  hasApiKey: boolean;
  apiKeyInput: string;
  lastCapture: string | null;
  stats: { stateCount: number; factCount: number; annotationCount: number };
}

type AppAction =
  | { type: "SET_VIEW"; view: OverlayView }
  | { type: "SET_PROFILE"; id: string; name: string }
  | { type: "SET_LEARNING_STATUS"; status: LearningStatus }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_HAS_API_KEY"; hasKey: boolean }
  | { type: "SET_API_KEY_INPUT"; value: string }
  | { type: "SET_LAST_CAPTURE"; timestamp: string }
  | {
      type: "SET_STATS";
      stats: { stateCount: number; factCount: number; annotationCount: number };
    };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, activeView: action.view };
    case "SET_PROFILE":
      return { ...state, profileId: action.id, profileName: action.name };
    case "SET_LEARNING_STATUS":
      return { ...state, learningStatus: action.status };
    case "ADD_MESSAGE":
      return {
        ...state,
        conversationHistory: [...state.conversationHistory, action.message],
      };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    case "SET_HAS_API_KEY":
      return { ...state, hasApiKey: action.hasKey };
    case "SET_API_KEY_INPUT":
      return { ...state, apiKeyInput: action.value };
    case "SET_LAST_CAPTURE":
      return { ...state, lastCapture: action.timestamp };
    case "SET_STATS":
      return { ...state, stats: action.stats };
    default:
      return state;
  }
}

const initialState: AppState = {
  activeView: "chat",
  profileId: null,
  profileName: "No app detected",
  learningStatus: "off",
  conversationHistory: [],
  isLoading: false,
  hasApiKey: false,
  apiKeyInput: "",
  lastCapture: null,
  stats: { stateCount: 0, factCount: 0, annotationCount: 0 },
};

const TABS: Array<{ id: OverlayView; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "status", label: "Status" },
  { id: "memory", label: "Memory" },
];

export function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Initialize: check API key, load profiles
  useEffect(() => {
    (async () => {
      try {
        const hasKey = (await window.retentAPI.invoke(
          "llm:has-api-key"
        )) as boolean;
        dispatch({ type: "SET_HAS_API_KEY", hasKey });

        const profiles = (await window.retentAPI.invoke("profile:list")) as Array<{
          id: string;
          appName: string;
        }>;
        if (profiles.length > 0) {
          dispatch({
            type: "SET_PROFILE",
            id: profiles[0].id,
            name: profiles[0].appName,
          });
        }
      } catch (err) {
        console.error("Init error:", err);
      }
    })();
  }, []);

  // Listen for IPC events
  useEffect(() => {
    const removeNewState = window.retentAPI.on(
      "capture:new-state",
      (...args: unknown[]) => {
        const stateNode = args[0] as { timestamp: string };
        dispatch({ type: "SET_LAST_CAPTURE", timestamp: stateNode.timestamp });
      }
    );

    const removeStatusChange = window.retentAPI.on(
      "capture:status-change",
      (...args: unknown[]) => {
        const isActive = args[0] as boolean;
        dispatch({
          type: "SET_LEARNING_STATUS",
          status: isActive ? "active" : "paused",
        });
      }
    );

    return () => {
      removeNewState();
      removeStatusChange();
    };
  }, []);

  // Refresh stats when profile changes or view switches to status/memory
  useEffect(() => {
    if (!state.profileId) return;
    if (state.activeView === "status" || state.activeView === "memory") {
      (async () => {
        try {
          const stats = (await window.retentAPI.invoke(
            "knowledge:get-stats",
            state.profileId
          )) as AppState["stats"];
          dispatch({ type: "SET_STATS", stats });
        } catch {
          // stats unavailable
        }
      })();
    }
  }, [state.profileId, state.activeView]);

  const handleSendMessage = useCallback(
    async (question: string) => {
      dispatch({
        type: "ADD_MESSAGE",
        message: { role: "user", content: question },
      });
      dispatch({ type: "SET_LOADING", loading: true });

      try {
        const response = (await window.retentAPI.invoke(
          "llm:ask",
          question
        )) as string;
        dispatch({
          type: "ADD_MESSAGE",
          message: { role: "assistant", content: response },
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Something went wrong";
        dispatch({
          type: "ADD_MESSAGE",
          message: { role: "assistant", content: `Error: ${message}` },
        });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    []
  );

  const handleSetApiKey = useCallback(async () => {
    const key = state.apiKeyInput.trim();
    if (!key) return;
    try {
      await window.retentAPI.invoke("llm:set-api-key", key);
      dispatch({ type: "SET_HAS_API_KEY", hasKey: true });
      dispatch({ type: "SET_API_KEY_INPUT", value: "" });
    } catch (err) {
      console.error("Failed to set API key:", err);
    }
  }, [state.apiKeyInput]);

  const handleToggleLearning = useCallback(async () => {
    try {
      await window.retentAPI.invoke("capture:toggle");
    } catch (err) {
      console.error("Failed to toggle capture:", err);
    }
  }, []);

  return (
    <div className="overlay-container">
      <div className="title-bar">
        <span className="title-text">Retent</span>
        <span className="profile-badge">{state.profileName}</span>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${state.activeView === tab.id ? "active" : ""}`}
            onClick={() => dispatch({ type: "SET_VIEW", view: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel-container">
        {!state.hasApiKey && state.activeView === "chat" ? (
          <div className="api-key-prompt">
            <p>Enter your Anthropic API key to get started:</p>
            <input
              type="password"
              value={state.apiKeyInput}
              onChange={(e) =>
                dispatch({ type: "SET_API_KEY_INPUT", value: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSetApiKey();
              }}
              placeholder="sk-ant-..."
              className="api-key-input"
            />
            <button onClick={handleSetApiKey} className="api-key-submit">
              Save Key
            </button>
          </div>
        ) : (
          <>
            {state.activeView === "chat" && (
              <ChatPanel
                messages={state.conversationHistory}
                onSend={handleSendMessage}
                isLoading={state.isLoading}
              />
            )}
            {state.activeView === "status" && (
              <StatusBar
                profileName={state.profileName}
                learningStatus={state.learningStatus}
                lastCapture={state.lastCapture}
                stats={state.stats}
                onToggleLearning={handleToggleLearning}
              />
            )}
            {state.activeView === "memory" && state.profileId && (
              <MemoryPanel profileId={state.profileId} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
