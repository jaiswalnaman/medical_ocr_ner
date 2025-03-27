export interface ProcessedDocument {
  raw_text: string;
  document_type?: string;
  enhanced_text?: string;
  entities?: string;
}

export interface FilePreviewProps {
  file: File;
  previewUrl: string;
  onRemove: () => void;
}

export interface ResultsProps {
  result: ProcessedDocument | null;
  onEnhanceText: () => void;
  isEnhancing: boolean;
}

export interface TextEditorProps {
  text: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}

export interface Entity {
  value: string;
  coordinates?: {
    start_idx: number;
    end_idx: number;
    text_snippet: string;
  };
}

export interface Entities {
  [key: string]: Entity | Entity[];
}