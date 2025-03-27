#Markdown
#NER UPDATEDD main
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import torch
from transformers import AutoProcessor, AutoModelForCausalLM
from PIL import Image
import openai
import mimetypes
from groq import Groq
import fitz
import docx
from pdf2image import convert_from_path
import zipfile
import tempfile
import shutil
from pyngrok import ngrok
import requests
import json
try:
    import fitz
    import docx
    from pdf2image import convert_from_path
    PDF_SUPPORT = True
except ImportError:
    print("PDF or DOCX support libraries not installed. Only image files will be processed.")
    PDF_SUPPORT = False

# Load environment variables
HF_TOKEN = os.getenv("HF_TOKEN")
groq_client = Groq(api_key="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")

# Device setup
device = "cuda:0" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

# Flask app
app = Flask(__name__)
CORS(app)

ngrok_url = None

# Global model and processor variables
model, processor = None, None

# Document type detection
def detect_document_type(text_content):
    text_lower = text_content.lower()

    # Prescription terms
    prescription_terms = [
        "rx", "prescription", "sig:", "refill", "dispense", "mg",
        "patient name", "date", "pharmacy", "prescriber", "signature",
        "directions", "quantity", "medication history"
    ]


    discharge_terms = [
        "discharge", "summary", "follow-up", "followup", "admission",
        "hospital course", "admission date", "discharge date",
        "chief complaint", "history of present illness", "past medical history",
        "physical exam", "vital signs", "diagnosis", "treatment plan",
        "discharge instructions", "condition on discharge"
    ]

    lab_report_terms = [
        "lab", "test results", "reference range", "specimen",
        "patient id", "collection date", "test ordered", "result status"
    ]


    radiology_terms = [
        "radiology", "x-ray", "mri", "ct scan", "ultrasound", "imaging",
        "impression", "findings", "technique"
    ]

    insurance_terms = [
        "insurance", "claim", "policy", "coverage", "authorization",
        "benefits", "subscriber", "insured", "copay", "deductible"
    ]

    pathology_terms = [
        "pathology", "biopsy", "histology", "cytology", "specimen",
        "tissue", "gross description", "microscopic description"
    ]

    if any(term in text_lower for term in discharge_terms):
        return "discharge_summary"
    elif any(term in text_lower for term in prescription_terms):
        return "prescription"
    elif any(term in text_lower for term in lab_report_terms):
        return "lab_report"
    elif any(term in text_lower for term in radiology_terms):
        return "radiology"
    elif any(term in text_lower for term in insurance_terms):
        return "insurance_claim"
    elif any(term in text_lower for term in pathology_terms):
        return "pathology_report"
    else:
        return "generic"

ENHANCEMENT_PROMPTS = {
    "prescription": """You are a medical prescription expert. Correct OCR errors in medicine names, dosages, and medical terms while preserving numbers and dates. Format the output in markdown with clear sections:
1. Patient Info
2. Medications
3. Instructions
4. Doctor Info

For Medications, list each entry on a single line as 'Medication Name - dosage' (e.g., 'Amoxicillin - 500 mg'). If no dosage is specified for a medication, exclude it from the list entirely. Do not separate dosages onto new lines or include medications without dosages. Provide only the final corrected text without annotations or indications of changes.""",

    "lab_report": """You are a medical laboratory report expert. Correct OCR errors in test names, values, and medical terms while preserving numbers, units, and reference ranges. Format the output in markdown with clear sections:
1. Patient Info
2. Test Results (include values and reference ranges)
3. Interpretation/Notes
4. Laboratory Information

Use a tabular structure for Test Results when possible. Provide only the final corrected text without annotations or indications of changes.""",

    "radiology": """You are a radiology report expert. Correct OCR errors in anatomical terms, findings, and medical terminology while preserving the original structure and measurements. Format the output in markdown with clear sections:
1. Patient Information
2. Examination Type
3. Findings
4. Impression/Conclusion

Provide only the final corrected text without annotations or indications of changes.""",

    "insurance_claim": """You are an insurance claim form expert. Correct OCR errors in policy numbers, procedure codes, diagnosis codes, and medical terms while preserving numbers, dates, and monetary values. Format the output in markdown with clear sections:
1. Patient/Subscriber Information
2. Insurance Provider Information
3. Service Details
4. Diagnosis and Procedure Codes
5. Charges and Payment Information

Maintain form structure and alignment where possible. Preserve all insurance codes (CPT, ICD, HCPCS) exactly as they appear. Provide only the final corrected text without annotations or indications of changes.""",

    "discharge_summary": """You are a hospital discharge summary expert. Correct OCR errors in medical terminology, medications, and treatment plans while preserving the original structure, medical codes, and dates. Format the output in markdown with clear sections:
1. Patient Information
2. Admission/Discharge Dates
3. Diagnoses
4. Hospital Course
5. Discharge Medications
6. Follow-up Instructions

Maintain bullet points or numbered lists as they appear. Provide only the final corrected text without annotations or indications of changes.""",

    "pathology_report": """You are a pathology report expert. Correct OCR errors in anatomical terms, specimen descriptions, and diagnostic terminology while preserving the original structure, technical measurements, and pathology codes. Format the output in markdown with clear sections:
1. Patient Information
2. Specimen Details
3. Gross Description
4. Microscopic Examination
5. Diagnosis/Impression

Provide only the final corrected text without annotations or indications of changes.""",

    "generic": """You are a medical document expert. Correct OCR errors in medical terminology, condition names, treatments, and medications while preserving numbers, dates, and measurements. Maintain the original document structure and enhance readability. Provide only the final corrected text without annotations or indications of changes."""
}

# NER Prompts for different document types
NER_PROMPTS = {
"prescription": """
You are a medical NLP expert tasked with analyzing a prescription.

Extract the following structured information from the provided prescription text. Ensure accurate recognition of medical terms, names, and dates. For each entity, include its location and context in the text by providing coordinates (start_idx, end_idx) and a text snippet.

### **Categories to Extract:**
1. **Patient Name** - Full name of the patient receiving the prescription.
2. **Doctor Name** - Name of the prescribing physician.
3. **Medication** - Names of prescribed drugs (e.g., "Aspirin", "Metformin").
4. **Dosage** - Specific dosage instructions (e.g., "500 mg", "2 tablets").
5. **Frequency** - How often the medication should be taken (e.g., "twice daily", "every 6 hours").
6. **Route of Administration** - How the medication is administered (e.g., "oral", "IV", "topical").
7. **Duration** - Length of time the medication should be taken (e.g., "10 days", "1 month").
8. **Prescription Date** - Date the prescription was issued.

### **Output Format:**
Return the extracted entities in Markdown format with clear sections. Use headers for each category and bullet points for lists. For each entity, include its value, coordinates (start_idx and end_idx), and context (text_snippet of up to 10 words around the entity) in the following format:
""",
"discharge_summary": """
You are a medical NLP expert specializing in analyzing discharge summaries.

Extract the following structured information from the provided discharge summary text. Ensure accurate recognition of medical terms, dates, and names.

### **Categories to Extract:**
1. **Patient Name** - Full name of the patient.
2. **Doctor Name** - Name of the treating doctor(s).
3. **Hospital Name** - Name of the hospital where treatment was given.
4. **Admission Date** - Date the patient was admitted (in YYYY-MM-DD format if available).
5. **Discharge Date** - Date of discharge (YYYY-MM-DD format).
6. **Primary Diagnosis** - Main medical condition treated.
7. **Secondary Diagnoses** - Any additional conditions (list format).
8. **Investigations Done** - Tests and examinations performed (e.g., "MRI", "CBC", "X-ray").
9. **Procedures Performed** - Surgeries or treatments conducted.
10. **Medications at Discharge** - List of prescribed medicines with dosage and frequency (if available).
11. **Follow-up Instructions** - Instructions for care after discharge.
12. **Next Appointment Date** - If mentioned, the next follow-up date.

### **Output Format:**
Return the extracted entities in Markdown format with clear sections. Use headers for each category and bullet points for lists. For each entity, include its value and coordinates (start_idx, end_idx), and context (text_snippet of up to 10 words around the entity) in the following format:

""",

"lab_report": """
You are a medical NLP expert tasked with analyzing a lab report.

Extract the following structured information from the provided lab report text. Ensure accurate recognition of medical terms, values, and dates. For each entity, include its location and context in the text by providing coordinates (start_idx, end_idx) and a text snippet.

### **Categories to Extract:**
1. **Patient Name** - Full name of the patient.
2. **Doctor Name** - Name of the ordering physician or lab personnel.
3. **Test Name** - Specific laboratory tests performed (e.g., "CBC", "Glucose Level", "Cholesterol Panel").
4. **Result Value** - Numerical or qualitative result of each test (e.g., "120 mg/dL", "Positive", "Normal").
5. **Reference Range** - Normal range for each test (e.g., "70-100 mg/dL", "Negative").
6. **Units** - Measurement units for results (e.g., "mg/dL", "mmol/L").
7. **Test Date** - Date the lab test was conducted or reported.
8. **Abnormal Flags** - Indicators of abnormal results (e.g., "High", "Low", "Critical").

### **Output Format:**
Return the extracted entities in Markdown format with clear sections. Use headers for each category and bullet points for lists. For each entity, include its value, coordinates (start_idx and end_idx), and context (text_snippet of up to 10 words around the entity) in the following format:
""",

"radiology": """
You are a medical NLP expert tasked with analyzing a radiology report.

Extract the following structured information from the provided radiology report text. Ensure accurate recognition of medical terms and names.

### **Categories to Extract:**
1. **Patient Name** - Full name of the patient.
2. **Doctor Name** - Name of the radiologist or referring physician.
3. **Imaging Type** - Type of imaging study performed (e.g., "X-ray", "MRI", "CT Scan").
4. **Body Part** - Anatomical region examined (e.g., "Chest", "Spine", "Brain").
5. **Findings** - Key observations or abnormalities noted (e.g., "Fracture", "Mass", "No abnormalities").
6. **Impression** - Radiologist's overall interpretation or diagnosis (e.g., "Pneumonia", "Normal study").
7. **Study Date** - Date the imaging study was performed.
8. **Recommendations** - Suggested next steps or follow-ups (e.g., "Repeat scan in 6 months").

### **Output Format:**
Return the extracted entities in Markdown format with clear sections. Use headers for each category and bullet points for lists. For each entity, include its value, coordinates (start_idx and end_idx), and context (text_snippet of up to 10 words around the entity) in the following format:

## **Radiology Report**

**Patient Name:** [Extracted Name]
**Doctor Name:** [Extracted Name]
**Imaging Type:** [e.g., MRI, X-ray]
**Body Part:**
- [e.g., Chest, Brain]
**Findings:**
- [e.g., Fracture, Mass]
**Impression:** [e.g., Pneumonia, Normal Study]
**Study Date:** [YYYY-MM-DD]
**Recommendations:**
- [e.g., Repeat scan in 6 months]
""",

"generic": """
You are a medical NLP expert tasked with analyzing a clinical document.

Extract the following structured information from the provided clinical document text. Ensure accurate recognition of medical terms and names. For each entity, include its location and context in the text by providing coordinates (start_idx, end_idx) and a text snippet.

### **Categories to Extract:**
1. **Disease/Condition** - Medical conditions mentioned (e.g., "Asthma", "Fracture").
2. **Medication** - Drugs or treatments prescribed (e.g., "Ibuprofen", "Insulin").
3. **Procedure** - Medical interventions performed (e.g., "Surgery", "Biopsy").
4. **Laboratory Test** - Diagnostic tests ordered or conducted (e.g., "Blood Test", "MRI").
5. **Symptom** - Patient-reported or observed symptoms (e.g., "Fever", "Pain").
6. **Body Part** - Anatomical locations mentioned (e.g., "Left Arm", "Lungs").
7. **Doctor Name** - Name of the physician involved.

### **Output Format:**
Return the extracted entities in Markdown format with clear sections. Use headers for each category and bullet points for lists. For each entity, include its value, coordinates (start_idx and end_idx), and context (text_snippet of up to 10 words around the entity) in the following format:
"""
}


# Load model and processor
def load_model():
    global model, processor
    if model is None or processor is None:
        model = AutoModelForCausalLM.from_pretrained(
            "microsoft/Florence-2-large", token=HF_TOKEN, torch_dtype=torch_dtype, trust_remote_code=True
        ).to(device)
        processor = AutoProcessor.from_pretrained(
            "microsoft/Florence-2-large", token=HF_TOKEN, trust_remote_code=True
        )
    return model, processor

def enhance_medical_text(text, doc_type=None):
    doc_type = doc_type or detect_document_type(text)
    prompt = ENHANCEMENT_PROMPTS.get(doc_type, ENHANCEMENT_PROMPTS["generic"])
    if "--- New Page ---" in text:
        prompt += """

This document contains multiple pages separated by "--- New Page ---" markers.
For each page:
1. Process the content separately
2. Start each page with "## Page X" (where X is the page number)
3. Apply appropriate formatting for each page."""

    # API endpoint and headers
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": "Bearer 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",  # Your API key
        "Content-Type": "application/json",
    }

    # Payload for the API request
    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": text}
        ],
        "temperature": 0.1,
        "max_tokens": 2048
    }

    try:
        # Make the POST request
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()

        # Parse the JSON response
        result = response.json()
        return result["choices"][0]["message"]["content"]

    except requests.exceptions.RequestException as e:
        print(f"Error with OpenRouter API: {e}")
        return text
    except (KeyError, IndexError) as e:
        print(f"Error parsing response: {e}")
        return text


def extract_medical_entities(text, doc_type=None):
    doc_type = doc_type or detect_document_type(text)
    prompt = NER_PROMPTS.get(doc_type, NER_PROMPTS["generic"])

    # Coordinates instruction
    coordinate_instruction = """
For each entity you extract, also provide its location in the text by including:
1. "start_idx": The character index where this entity starts in the original text
2. "end_idx": The character index where this entity ends in the original text
3. "text_snippet": A short snippet of text containing the entity (up to 10 words around it)
"""

    prompt += coordinate_instruction

    # API endpoint and headers
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": text}
        ],
        "temperature": 0.2,
        "max_tokens": 1024
    }

    try:
        # Make the POST request
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()

        # Parse the response
        result = response.json()
        extracted_entities = result["choices"][0]["message"]["content"]

        # Return the Markdown string as-is (no JSON cleanup needed)
        return extracted_entities

    except requests.exceptions.RequestException as e:
        print(f"Error with OpenRouter API: {e}")
        return f"## Error\n- **Message:** API request failed - {e}"
    except (KeyError, IndexError) as e:
        print(f"Error parsing response: {e}")
        return f"## Error\n- **Message:** Response parsing failed - {e}"

def run_ocr(image, model, processor):
    inputs = processor(text="<OCR>", images=image, return_tensors="pt").to(device, torch_dtype)
    generated_ids = model.generate(input_ids=inputs["input_ids"], pixel_values=inputs["pixel_values"], max_new_tokens=1024, num_beams=3)
    return processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

def process_file(file_path, model, processor):
    file_type = mimetypes.guess_type(file_path)[0]
    if file_type.startswith('image/'):
        image = Image.open(file_path).convert("RGB")
        raw_text = run_ocr(image, model, processor)
    elif file_type == 'application/pdf':
        images = convert_from_path(file_path)
        raw_text = "\n\n--- New Page ---\n\n".join([run_ocr(img, model, processor) for img in images])
    elif file_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        doc = docx.Document(file_path)
        raw_text = "\n".join([para.text for para in doc.paragraphs])
    else:
        raise ValueError("Unsupported file type")

    doc_type = detect_document_type(raw_text)
    enhanced_text = enhance_medical_text(raw_text, doc_type)
    return raw_text, doc_type, enhanced_text

# Store temp enhanced text for review
review_data = {}

# API Endpoints
@app.route('/')
def index():
    return jsonify({"ngrok_url": ngrok_url})

@app.route('/ocr', methods=['POST'])
def ocr():
    # Model loading
    global model, processor
    if model is None or processor is None:
        model, processor = load_model()

    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    temp_path = os.path.join(tempfile.gettempdir(), file.filename)
    file.save(temp_path)

    try:
        if file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            image = Image.open(temp_path).convert("RGB")
            raw_text = run_ocr(image, model, processor)
        elif file.filename.lower().endswith('.pdf'):
            images = convert_from_path(temp_path)
            raw_text = "\n\n--- New Page ---\n\n".join([run_ocr(img, model, processor) for img in images])
        else:
            return jsonify({"error": "Unsupported file type for OCR"}), 400
    finally:
        os.remove(temp_path)


    return jsonify({"raw_text": raw_text})

@app.route('/enhance-text', methods=['POST'])
def enhance_text():
    data = request.json
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400
    doc_type = data.get('document_type')
    enhanced_text = enhance_medical_text(data['text'], doc_type)
    return jsonify({"enhanced_text": enhanced_text})

@app.route('/process-document', methods=['POST'])
def process_document():
    #Model loading check
    global model, processor
    if model is None or processor is None:
        model, processor = load_model()

    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    temp_path = os.path.join(tempfile.gettempdir(), file.filename)
    file.save(temp_path)

    try:
        raw_text, doc_type, enhanced_text = process_file(temp_path, model, processor)
    finally:
        os.remove(temp_path)

    # Store enhanced text for review
    review_data['raw_text'] = raw_text
    review_data['doc_type'] = doc_type
    review_data['enhanced_text'] = enhanced_text

    return jsonify({"raw_text": raw_text, "document_type": doc_type, "enhanced_text": enhanced_text})



@app.route('/extract-entities', methods=['POST'])
def extract_entities():
    data = request.json
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400

    # Use the text from the request or from review_data if not provided
    text = data.get('text', review_data.get('enhanced_text', ''))
    if not text:
        return jsonify({"error": "No text available for entity extraction"}), 400

    doc_type = data.get('document_type', review_data.get('doc_type', None))

    # Extract entities in Markdown format
    extracted_entities = extract_medical_entities(text, doc_type)

    # Store the extracted entities in review_data
    review_data['extracted_entities'] = extracted_entities

    return jsonify({"entities": extracted_entities, "document_type": doc_type})

@app.route('/review-enhanced-text', methods=['GET'])
def review_enhanced_text():
    if 'enhanced_text' not in review_data:
        return jsonify({"error": "No data available for review"}), 400
    return jsonify({
        "raw_text": review_data.get('raw_text'),
        "document_type": review_data.get('doc_type'),
        "enhanced_text": review_data.get('enhanced_text')
    })

@app.route('/submit-edited-text', methods=['POST'])
def submit_edited_text():
    data = request.json
    if not data or 'edited_text' not in data:
        return jsonify({"error": "No edited text provided"}), 400

    edited_text = data['edited_text']
    review_data['enhanced_text'] = edited_text


    # with open('final_output.txt', 'w') as f:
    #     f.write(edited_text)

    return jsonify({"message": "Edited text submitted successfully", "final_text": edited_text})
@app.route('/submit-edited-entities', methods=['POST'])
def submit_edited_entities():
    data = request.json
    if not data or 'edited_entities' not in data:
        return jsonify({"error": "No edited entities provided"}), 400

    edited_entities = data['edited_entities']
    review_data['extracted_entities'] = edited_entities

    return jsonify({"message": "Edited entities submitted successfully", "final_entities": edited_entities})
@app.route('/review-entities', methods=['GET'])
def review_entities():
    if 'extracted_entities' not in review_data:
        return jsonify({"error": "No entities available for review"}), 400
    return jsonify({
        "entities": review_data.get('extracted_entities'),
        "document_type": review_data.get('doc_type')
    })

if __name__ == '__main__':

    print("Loading OCR model")
    model, processor = load_model()
    print("OCR model loaded successfully!")

    # Start ngrok
    ngrok.set_auth_token("2sZ5XhlSpbBFHl8e0eYi9GRS84V_2trovzX3Jfw8ttDJ7zngU")
    ngrok_url = ngrok.connect(5000).public_url
    print(f"Public URL: {ngrok_url}")

    # Run Flask app
    app.run(port=5000)


