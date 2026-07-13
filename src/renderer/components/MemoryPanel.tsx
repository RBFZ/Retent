import React, { useEffect, useState, useCallback } from "react";
import type { Fact, Annotation } from "@shared/types";

interface MemoryPanelProps {
  profileId: string;
}

export function MemoryPanel({
  profileId,
}: MemoryPanelProps): React.JSX.Element {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const loadData = useCallback(async () => {
    try {
      const [factsResult, annotationsResult] = await Promise.all([
        window.retentAPI.invoke("knowledge:get-facts", profileId),
        window.retentAPI.invoke("knowledge:get-annotations", profileId),
      ]);
      setFacts(factsResult as Fact[]);
      setAnnotations(annotationsResult as Annotation[]);
    } catch (err) {
      console.error("Failed to load memory data:", err);
    }
  }, [profileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteFact = useCallback(
    async (factId: number) => {
      try {
        await window.retentAPI.invoke("knowledge:forget-fact", factId);
        await loadData();
      } catch (err) {
        console.error("Failed to delete fact:", err);
      }
    },
    [loadData]
  );

  const handleDeleteAnnotation = useCallback(
    async (annotationId: number) => {
      try {
        await window.retentAPI.invoke(
          "knowledge:forget-annotation",
          annotationId
        );
        await loadData();
      } catch (err) {
        console.error("Failed to delete annotation:", err);
      }
    },
    [loadData]
  );

  const handleForgetAll = useCallback(async () => {
    try {
      await window.retentAPI.invoke("knowledge:forget-profile", profileId);
      setFacts([]);
      setAnnotations([]);
    } catch (err) {
      console.error("Failed to forget profile:", err);
    }
  }, [profileId]);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Group facts by category
  const grouped = new Map<string, Fact[]>();
  for (const fact of facts) {
    const cat = fact.category ?? "uncategorized";
    const existing = grouped.get(cat);
    if (existing) {
      existing.push(fact);
    } else {
      grouped.set(cat, [fact]);
    }
  }

  return (
    <div className="memory-panel">
      <div className="memory-header">
        <span className="memory-count">{facts.length} facts</span>
        {facts.length > 0 && (
          <button className="forget-all-btn" onClick={handleForgetAll}>
            Forget All
          </button>
        )}
      </div>

      {facts.length === 0 && annotations.length === 0 && (
        <div className="empty-state">No knowledge stored yet.</div>
      )}

      {Array.from(grouped.entries()).map(([category, categoryFacts]) => (
        <div key={category} className="fact-category">
          <button
            className="category-header"
            onClick={() => toggleCategory(category)}
          >
            <span className="category-arrow">
              {expandedCategories.has(category) ? "\u25BC" : "\u25B6"}
            </span>
            <span className="category-name">{category}</span>
            <span className="category-count">{categoryFacts.length}</span>
          </button>
          {expandedCategories.has(category) && (
            <div className="category-facts">
              {categoryFacts.map((fact) => (
                <div key={fact.id} className="fact-item">
                  <div className="fact-content">
                    <span className="fact-key">{fact.key}</span>
                    <span className="fact-value">{fact.value}</span>
                    <span
                      className={`fact-confidence confidence-${fact.confidence}`}
                    >
                      {fact.confidence}
                    </span>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteFact(fact.id)}
                    title="Forget this fact"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {annotations.length > 0 && (
        <div className="annotations-section">
          <h3 className="section-heading">Notes</h3>
          {annotations.map((ann) => (
            <div key={ann.id} className="annotation-item">
              <span className="annotation-note">{ann.note}</span>
              <button
                className="delete-btn"
                onClick={() => handleDeleteAnnotation(ann.id)}
                title="Forget this note"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
