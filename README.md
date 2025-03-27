# Medical Document OCR

A React application for processing and enhancing medical documents using OCR technology.

## Features

- Document upload and preview support (PDF, Images)
- OCR text extraction
- Medical document type detection
- Text enhancement with AI
- Markdown rendering
- PDF preview with zoom and page navigation
- Text editing capabilities
- Copy and download functionality

## Tech Stack

- React 18
- TypeScript
- Vite
- TailwindCSS
- React Markdown
- React PDF
- Lucide Icons

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/         # Page components
├── utils/         # Helper functions and constants
├── types/         # TypeScript type definitions
└── hooks/         # Custom React hooks
```

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Environment Variables

The application expects the following environment variables:

- `VITE_BACKEND_URL`: Backend API URL for OCR processing

## License

MIT