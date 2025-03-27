import React, { useRef } from 'react';
import { Upload, X, FileText } from 'lucide-react';

interface FileUploadProps {
  file: File | null;
  onFileChange: (file: File) => void;
  onRemoveFile: () => void;
}

export function FileUpload({ file, onFileChange, onRemoveFile }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      onFileChange(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileChange(e.target.files[0]);
    }
  };

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-lg p-8 text-center
        ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'}
      `}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {file && (
        <button
          type="button"
          onClick={onRemoveFile}
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
  );
}