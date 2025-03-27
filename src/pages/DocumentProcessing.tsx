import React, { useState, useRef } from 'react';
import {
  Upload,
  FileType,
  FileText,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Download,
  Edit2,
  Save,
  RotateCcw,
  X,
  Wand2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Document, Page, pdfjs } from 'react-pdf';
import type { FormEvent } from 'react';
import { processDocument, enhanceText, submitEditedText } from '../utils/api';
import { EntityDisplay } from '../components/EntityDisplay';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface ProcessedDocument {
  raw_text: string;
  document_type?: string;
  enhanced_text?: string;
}

function DocumentProcessing() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedDocument | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setResult(null);
      handleFilePreview(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setResult(null);
      handleFilePreview(selectedFile);
    }
  };

  const handleFilePreview = (file: File) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setShowPreview(true);
    setPageNumber(1);
    setScale(1);
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setResult(null);
    setPreviewUrl(null);
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleDownloadText = () => {
    if (!result) return;

    const text = result.enhanced_text || result.raw_text;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted-text-${result.document_type || 'document'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const changePage = (offset: number) => {
    setPageNumber((prevPageNumber) =>
      Math.min(Math.max(1, prevPageNumber + offset), numPages || 1)
    );
  };

  const adjustScale = (delta: number) => {
    setScale((prevScale) => Math.min(Math.max(0.5, prevScale + delta), 2));
  };

  const startEditing = () => {
    if (result) {
      setEditedText(result.enhanced_text || result.raw_text);
      setIsEditing(true);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            textareaRef.current.value.length,
            textareaRef.current.value.length
          );
        }
      }, 0);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedText('');
  };

  const saveEditedText = async () => {
    if (!editedText) return;

    setIsSaving(true);
    setError(null);

    try {
      const data = await submitEditedText(editedText);
      setResult((prev) => ({
        ...prev!,
        enhanced_text: data.final_text,
      }));
      setIsEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save edited text'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnhanceText = async () => {
    if (!result?.raw_text) return;

    setIsEnhancing(true);
    setError(null);

    try {
      const data = await enhanceText(result.raw_text, result.document_type);
      setResult((prev) => ({
        ...prev!,
        enhanced_text: data.enhanced_text,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enhance text');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const data = await processDocument(file);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Medical Document OCR
          </h1>
          <p className="text-lg text-gray-600 mb-4">
            Upload medical documents for OCR processing and enhancement
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Upload Section */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <form onSubmit={handleSubmit}>
                  <div
                    className={`
                      relative border-2 border-dashed rounded-lg p-8 mb-6 text-center
                      ${
                        file
                          ? 'border-green-400 bg-green-50'
                          : 'border-gray-300 hover:border-blue-400'
                      }
                    `}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                  >
                    {file && (
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="absolute top-2 right-2 p-1 rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".jpg,.jpeg,.png,.pdf,.docx"
                    />

                    <div className="mb-4">
                      {file ? (
                        <FileText className="w-12 h-12 mx-auto text-green-500" />
                      ) : (
                        <Upload className="w-12 h-12 mx-auto text-gray-400" />
                      )}
                    </div>

                    <div className="mb-4">
                      {file ? (
                        <p className="text-green-600 font-medium">{file.name}</p>
                      ) : (
                        <p className="text-gray-500">
                          Drag & drop your file here or{' '}
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-blue-500 hover:text-blue-600 font-medium"
                          >
                            browse
                          </button>
                        </p>
                      )}
                    </div>

                    <p className="text-sm text-gray-500">
                      Supports: JPG, PNG, PDF, DOCX
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="submit"
                      disabled={!file || isProcessing}
                      className={`
                        flex-1 py-3 px-4 rounded-lg font-medium text-white
                        ${
                          isProcessing
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-500 hover:bg-blue-600'
                        }
                        transition duration-200
                      `}
                    >
                      {isProcessing ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Processing...
                        </span>
                      ) : (
                        'Process Document'
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPreview(!showPreview)}
                      disabled={!file}
                      className={`
                        px-4 rounded-lg font-medium border
                        ${
                          !file
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                        }
                        transition duration-200
                      `}
                    >
                      {showPreview ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </form>

                {/* File Preview Section */}
                {showPreview && file && previewUrl && (
                  <div className="mt-6 border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        File Preview
                      </h3>
                      <div className="flex items-center gap-2">
                        {file.type === 'application/pdf' && numPages && (
                          <>
                            <button
                              onClick={() => changePage(-1)}
                              disabled={pageNumber <= 1}
                              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-sm text-gray-600">
                              Page {pageNumber} of {numPages}
                            </span>
                            <button
                              onClick={() => changePage(1)}
                              disabled={pageNumber >= (numPages || 1)}
                              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                            <div className="h-6 w-px bg-gray-200 mx-2" />
                          </>
                        )}
                        <button
                          onClick={() => adjustScale(-0.1)}
                          className="p-1 rounded hover:bg-gray-100"
                          title="Zoom out"
                        >
                          <ZoomOut className="w-5 h-5" />
                        </button>
                        <span className="text-sm text-gray-600 min-w-[3rem] text-center">
                          {Math.round(scale * 100)}%
                        </span>
                        <button
                          onClick={() => adjustScale(0.1)}
                          className="p-1 rounded hover:bg-gray-100"
                          title="Zoom in"
                        >
                          <ZoomIn className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div
                      ref={previewContainerRef}
                      className="flex justify-center bg-gray-50 rounded-lg p-4 overflow-auto"
                      style={{ height: '500px' }}
                    >
                      <div className="flex items-center justify-center min-h-full">
                        {file.type === 'application/pdf' ? (
                          <Document
                            file={previewUrl}
                            onLoadSuccess={onDocumentLoadSuccess}
                            className="max-w-full"
                          >
                            <Page
                              pageNumber={pageNumber}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              scale={scale}
                              className="shadow-lg"
                            />
                          </Document>
                        ) : (
                          <img
                            src={previewUrl}
                            alt="File preview"
                            className="max-h-full w-auto object-contain rounded shadow-lg"
                            style={{ transform: `scale(${scale})` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-4 bg-red-50 rounded-lg flex items-start">
                  <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                  <p className="text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* Results Section */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              {result ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b">
                    <h2 className="text-xl font-semibold text-gray-900">
                      OCR Results
                    </h2>
                    <button
                      onClick={handleEnhanceText}
                      disabled={isEnhancing || !result.raw_text}
                      className={`
                        flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-white
                        ${
                          isEnhancing
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-purple-500 hover:bg-purple-600'
                        }
                        transition duration-200
                      `}
                    >
                      {isEnhancing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Enhancing...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                          Enhance Text
                        </>
                      )}
                    </button>
                  </div>

                  {result.document_type && (
                    <div className="bg-indigo-50 rounded-lg p-4 mb-4">
                      <h3 className="text-lg font-medium text-indigo-900 mb-1">
                        Document Type
                      </h3>
                      <p className="text-indigo-700 capitalize">
                        {result.document_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-medium text-gray-900">
                        {isEditing ? 'Edit Text' : 'Enhanced Text'}
                      </h3>
                      <div className="flex gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              onClick={saveEditedText}
                              disabled={isSaving}
                              className="flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors"
                            >
                              {isSaving ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <Save className="w-3.5 h-3.5 mr-1.5" />
                              )}
                              Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={startEditing}
                              className="flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                handleCopyText(
                                  result.enhanced_text || result.raw_text
                                )
                              }
                              className="flex items-center px-2 py-1 text-xs font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                              title="Copy to clipboard"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={handleDownloadText}
                              className="flex items-center px-2 py-1 text-xs font-medium rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                              title="Download as text file"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                      {isEditing ? (
                        <textarea
                          ref={textareaRef}
                          value={editedText}
                          onChange={(e) => setEditedText(e.target.value)}
                          className="w-full h-[400px] p-2 border rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              table: ({ children }) => (
                                <table className="min-w-full divide-y divide-gray-200 my-4">
                                  {children}
                                </table>
                              ),
                              thead: ({ children }) => (
                                <thead className="bg-gray-100">{children}</thead>
                              ),
                              th: ({ children }) => (
                                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="px-4 py-2 text-sm text-gray-700 border-t">
                                  {children}
                                </td>
                              ),
                              h1: ({ children }) => (
                                <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-4">
                                  {children}
                                </h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-xl font-semibold text-gray-900 mt-5 mb-3">
                                  {children}
                                </h2>
                              ),
                            }}
                          >
                            {result.enhanced_text || result.raw_text}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <FileType className="w-16 h-16 mb-4" />
                  <p className="text-lg text-center">
                    OCR results will appear here
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Entity Recognition Section */}
          {result && <EntityDisplay document={result} />}
        </div>
      </div>
    </div>
  );
}

export default DocumentProcessing;