import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronRight, Loader2, AlertCircle, Edit2, Save, RotateCcw, Copy, Check, Download } from 'lucide-react';
import { extractEntities, reviewEntities, submitEditedEntities } from '../utils/api';
import type { ProcessedDocument } from '../types';

interface EntityDisplayProps {
  document: ProcessedDocument;
}

export function EntityDisplay({ document }: EntityDisplayProps) {
  const [entities, setEntities] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editedEntities, setEditedEntities] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const fetchEntities = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await extractEntities(
        document.enhanced_text || document.raw_text,
        document.document_type
      );
      
      // Strip ```markdown``` or ``` fences
      let markdownContent = data.entities.replace(/```markdown\n|```/g, '').trim();
      setEntities(markdownContent);
      setEditedEntities(markdownContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract entities');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedEntities(entities);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedEntities(entities);
  };

  const handleSave = async () => {
    if (!editedEntities) return;

    setIsSaving(true);
    setError(null);

    try {
      const data = await submitEditedEntities(editedEntities);
      setEntities(data.final_entities);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entities');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entities);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleDownload = () => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || !document) {
      console.warn('Download is only available in browser environment');
      return;
    }

    try {
      // Try to parse as JSON first
      let content: string;
      try {
        const jsonData = JSON.parse(entities);
        content = JSON.stringify(jsonData, null, 2);
      } catch {
        // If not valid JSON, use as plain text
        content = entities;
      }

      const blob = new Blob([content], { 
        type: content === entities ? 'text/plain' : 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `entities-${document.document_type || 'document'}.${content === entities ? 'txt' : 'json'}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download entities:', err);
      setError('Failed to download entities');
    }
  };

  useEffect(() => {
    const fetchInitialEntities = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await reviewEntities();
        setEntities(data.entities);
        setEditedEntities(data.entities);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load entities');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialEntities();
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Named Entity Recognition
        </h2>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center px-4 py-2 rounded-lg font-medium text-white bg-green-500 hover:bg-green-600 disabled:bg-gray-400"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center px-4 py-2 rounded-lg font-medium text-gray-700 bg-gray-200 hover:bg-gray-300"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={fetchEntities}
                disabled={isLoading}
                className={`
                  flex items-center px-4 py-2 rounded-lg font-medium text-white
                  ${isLoading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'}
                  transition duration-200
                `}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Extract Entities'
                )}
              </button>
              {entities && (
                <>
                  <button
                    onClick={handleCopy}
                    className="flex items-center px-3 py-2 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                    title="Copy to clipboard"
                  >
                    {isCopied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center px-3 py-2 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                    title="Download as text file"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleEdit}
                    className="flex items-center px-4 py-2 rounded-lg font-medium text-white bg-purple-500 hover:bg-purple-600"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg text-red-600">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        </div>
      )}

      {isEditing ? (
        <textarea
          value={editedEntities}
          onChange={(e) => setEditedEntities(e.target.value)}
          className="w-full h-[400px] p-4 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        entities && (
          <div className="space-y-2">
            <ReactMarkdown
              components={{
                h1: ({ children, ...props }) => {
                  const id = children?.toString() || '';
                  const isExpanded = expandedSections.has(id);
                  return (
                    <div className="border rounded-lg overflow-hidden mb-2">
                      <button
                        onClick={() => toggleSection(id)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                      >
                        <span className="font-semibold text-gray-900">
                          {children}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-500" />
                        )}
                      </button>
                      <div
                        className={`p-4 bg-white transition-all duration-200 ${
                          isExpanded ? 'block' : 'hidden'
                        }`}
                      >
                        {props.children}
                      </div>
                    </div>
                  );
                },
                ul: ({ children }) => (
                  <ul className="space-y-2 text-gray-700">{children}</ul>
                ),
                li: ({ children }) => (
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>{children}</span>
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-gray-900">
                    {children}
                  </strong>
                ),
              }}
            >
              {entities}
            </ReactMarkdown>
          </div>
        )
      )}
    </div>
  );
}