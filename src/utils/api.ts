const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://d7a6-34-125-255-75.ngrok-free.app/';

export async function processDocument(file: File) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${BACKEND_URL}/process-document`, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to process document: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    console.error("Network error:", error);
    throw new Error(`Failed to process document: ${error.message}`);
  }
}

export async function enhanceText(text: string, documentType?: string) {
  try {
    const response = await fetch(`${BACKEND_URL}/enhance-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ text, document_type: documentType }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to enhance text: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    console.error("Network error:", error);
    throw new Error(`Failed to enhance text: ${error.message}`);
  }
}

export async function extractEntities(text: string, documentType?: string) {
  try {
    const response = await fetch(`${BACKEND_URL}/extract-entities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ text, document_type: documentType }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to extract entities: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    console.error("Network error:", error);
    throw new Error(`Failed to extract entities: ${error.message}`);
  }
}

export async function submitEditedText(editedText: string) {
  try {
    const response = await fetch(`${BACKEND_URL}/submit-edited-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ edited_text: editedText }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save edited text: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    console.error("Network error:", error);
    throw new Error(`Failed to save edited text: ${error.message}`);
  }
}

export async function reviewEntities() {
  try {
    const response = await fetch(`${BACKEND_URL}/review-entities`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to load entities: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    console.error("Network error:", error);
    throw new Error(`Failed to load entities: ${error.message}`);
  }
}

export async function submitEditedEntities(editedEntities: string) {
  try {
    const response = await fetch(`${BACKEND_URL}/submit-edited-entities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ edited_entities: editedEntities }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save entities: ${response.status} - ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    console.error("Network error:", error);
    throw new Error(`Failed to save entities: ${error.message}`);
  }
}