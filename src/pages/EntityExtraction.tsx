import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Edit2,
  RotateCcw,
  Loader2,
  AlertCircle,
  Download,
  Code,
} from 'lucide-react';
import { extractEntities, submitEditedEntities } from '../utils/api';

interface Entity {
  value: string;
  coordinates?: {
    start_idx: number;
    end_idx: number;
    text_snippet: string;
  };
}

interface Entities {
  [key: string]: Entity | Entity[];
}

function EntityExtraction() {
  const navigate = useNavigate();
  const [documentData, setDocumentData] = useState<any>(null);
  const [entities, setEntities] = useState<Entities | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedEntities, setEditedEntities] = useState<Entities | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    const storedData = sessionStorage.getItem('documentData');
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        setDocumentData(parsedData);
        fetchEntities(parsedData);
      } catch (err) {
        setError('Invalid document data format');
        setRawResponse(storedData);
        setIsLoading(false);
      }
    } else {
      setError('No document data found');
      setIsLoading(false);
    }
  }, []);

  const tryParseJSON = (jsonString: string) => {
    try {
      return { success: true, data: JSON.parse(jsonString) };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Invalid JSON format'
      };
    }
  };

  const fetchEntities = async (data: any) => {
    try {
      const response = await extractEntities(
        data.enhanced_text || data.raw_text,
        data.document_type
      );

      // Store the raw response
      const rawResponseStr = JSON.stringify(response, null, 2);
      setRawResponse(rawResponseStr);

      let parsedEntities;
      
      // First try to get entities from the response
      if (typeof response.entities === 'string') {
        const parseResult = tryParseJSON(response.entities);
        if (!parseResult.success) {
          console.error('Failed to parse entities string:', parseResult.error);
          setError(`Failed to parse entities: ${parseResult.error}`);
          setShowRawJson(true);
          return;
        }
        parsedEntities = parseResult.data;
      } else if (typeof response.entities === 'object') {
        parsedEntities = response.entities;
      } else {
        throw new Error('Invalid response format');
      }

      // Validate and normalize the entities structure
      if (parsedEntities && typeof parsedEntities === 'object') {
        const normalizedEntities: Entities = {};

        for (const [category, data] of Object.entries(parsedEntities)) {
          if (Array.isArray(data)) {
            normalizedEntities[category] = data.map(item => ({
              value: item?.value || '',
              coordinates: item?.coordinates ? {
                start_idx: item.coordinates.start_idx || 0,
                end_idx: item.coordinates.end_idx || 0,
                text_snippet: item.coordinates.text_snippet || ''
              } : undefined
            }));
          } else if (data && typeof data === 'object') {
            normalizedEntities[category] = {
              value: (data as Entity)?.value || '',
              coordinates: (data as Entity)?.coordinates ? {
                start_idx: (data as Entity).coordinates!.start_idx || 0,
                end_idx: (data as Entity).coordinates!.end_idx || 0,
                text_snippet: (data as Entity).coordinates!.text_snippet || ''
              } : undefined
            };
          } else {
            normalizedEntities[category] = { value: '' };
          }
        }

        setEntities(normalizedEntities);
        setEditedEntities(normalizedEntities);
        setError(null);
      } else {
        throw new Error('Invalid entity structure');
      }
    } catch (err) {
      console.error('Entity extraction error:', err);
      setError(err instanceof Error ? err.message : 'Failed to extract entities');
      if (err instanceof Response) {
        try {
          const errorText = await err.text();
          setRawResponse(errorText);
          setShowRawJson(true);
        } catch (e) {
          setRawResponse('Failed to read error response');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    setEditedEntities(entities);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedEntities(entities);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!editedEntities) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await submitEditedEntities(editedEntities);
      let finalEntities;

      if (typeof response.final_entities === 'string') {
        const parseResult = tryParseJSON(response.final_entities);
        if (!parseResult.success) {
          throw new Error(`Failed to parse saved entities: ${parseResult.error}`);
        }
        finalEntities = parseResult.data;
      } else {
        finalEntities = response.final_entities;
      }

      setEntities(finalEntities);
      setIsEditing(false);
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save entities');
      if (err instanceof Response) {
        try {
          const errorText = await err.text();
          setRawResponse(errorText);
          setShowRawJson(true);
        } catch (e) {
          setRawResponse('Failed to read error response');
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!entities && !rawResponse) return;

    try {
      const jsonString = entities 
        ? JSON.stringify(entities, null, 2)
        : rawResponse;
      const blob = new Blob([jsonString || ''], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extracted-entities-${documentData?.document_type || 'document'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download entities');
    }
  };

  const handleEntityChange = (
    category: string,
    index: number,
    field: string,
    value: string
  ) => {
    if (!editedEntities) return;

    setEditedEntities((prev) => {
      if (!prev) return prev;

      const updated = { ...prev };
      if (Array.isArray(updated[category])) {
        const entityArray = [...(updated[category] as Entity[])];
        entityArray[index] = {
          ...entityArray[index],
          [field]: value,
        };
        updated[category] = entityArray;
      } else {
        updated[category] = {
          ...(updated[category] as Entity),
          [field]: value,
        };
      }
      return updated;
    });
  };

  const getEntityValue = (
    entityData: Entity | Entity[],
    category: string,
    index: number
  ): string => {
    if (Array.isArray(entityData)) {
      return entityData[index]?.value || '';
    }
    return (entityData as Entity)?.value || '';
  };

  const toggleRawJson = () => {
    setShowRawJson(!showRawJson);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="text-lg text-gray-700">Extracting entities...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Document Processing
          </button>
          
          <div className="flex gap-2">
            {error && rawResponse && (
              <button
                onClick={toggleRawJson}
                className="flex items-center px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                <Code className="w-4 h-4 mr-2" />
                {showRawJson ? 'Hide' : 'Show'} Raw JSON
              </button>
            )}
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400"
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
                  className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleDownload}
                  className="flex items-center px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download JSON
                </button>
                {!error && (
                  <button
                    onClick={handleEdit}
                    className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Entities
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-600 font-medium">{error}</p>
              {rawResponse && showRawJson && (
                <pre className="mt-4 p-4 bg-gray-800 text-gray-100 rounded-lg overflow-auto text-sm">
                  {rawResponse}
                </pre>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Extracted Entities
          </h2>

          {entities && !showRawJson && (
            <div className="space-y-6">
              {Object.entries(entities).map(([category, entityData]) => (
                <div
                  key={category}
                  className="border rounded-lg p-4 bg-gray-50"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    {category.replace(/_/g, ' ')}
                  </h3>
                  {Array.isArray(entityData) ? (
                    <div className="space-y-4">
                      {entityData.map((entity, index) => (
                        <div
                          key={index}
                          className="bg-white p-4 rounded-lg shadow-sm"
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              value={getEntityValue(
                                editedEntities?.[category] || entityData,
                                category,
                                index
                              )}
                              onChange={(e) =>
                                handleEntityChange(
                                  category,
                                  index,
                                  'value',
                                  e.target.value
                                )
                              }
                              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 mb-2"
                            />
                          ) : (
                            <p className="font-medium text-gray-900 mb-2">
                              {entity?.value || ''}
                            </p>
                          )}
                          {entity?.coordinates && (
                            <div className="text-sm text-gray-500">
                              <p>
                                Position:{' '}
                                {`${entity.coordinates.start_idx}-${entity.coordinates.end_idx}`}
                              </p>
                              <p className="mt-1">
                                Context: "{entity.coordinates.text_snippet}"
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white p-4 rounded-lg shadow-sm">
                      {isEditing ? (
                        <input
                          type="text"
                          value={getEntityValue(
                            editedEntities?.[category] || entityData,
                            category,
                            0
                          )}
                          onChange={(e) =>
                            handleEntityChange(category, 0, 'value', e.target.value)
                          }
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 mb-2"
                        />
                      ) : (
                        <p className="font-medium text-gray-900 mb-2">
                          {entityData?.value || ''}
                        </p>
                      )}
                      {entityData?.coordinates && (
                        <div className="text-sm text-gray-500">
                          <p>
                            Position:{' '}
                            {`${entityData.coordinates.start_idx}-${entityData.coordinates.end_idx}`}
                          </p>
                          <p className="mt-1">
                            Context: "{entityData.coordinates.text_snippet}"
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showRawJson && rawResponse && (
            <pre className="p-4 bg-gray-800 text-gray-100 rounded-lg overflow-auto text-sm">
              {rawResponse}
            </pre>
          )}

          {!entities && !error && !rawResponse && (
            <div className="text-center text-gray-500 py-8">
              No entities found in the document.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EntityExtraction;