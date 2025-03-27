from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import torch
from pyngrok import ngrok
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

# Load environment variables
HF_TOKEN = os.getenv("HF_TOKEN")
groq_client = Groq(api_key="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")

# Device setup
device = "cuda:0" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

# Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Store ngrok URL
ngrok_url = None

# Load model and processor
model, processor = None, None
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

# Your existing functions remain the same
def detect_document_type(text_content):
    text_lower = text_content.lower()

    if any(term in text_lower for term in ["rx", "prescription", "sig:", "refill", "dispense", "mg"]):
        return "prescription"
    elif any(term in text_lower for term in ["lab", "test results", "reference range", "specimen"]):
        return "lab_report"
    elif any(term in text_lower for term in ["radiology", "x-ray", "mri", "ct scan", "ultrasound", "imaging"]):
        return "radiology"
    elif any(term in text_lower for term in ["insurance", "claim", "policy", "coverage", "authorization", "benefits", "subscriber", "insured", "copay", "deductible"]):
        return "insurance_claim"
    elif any(term in text_lower for term in ["discharge", "summary", "follow-up", "followup", "admission", "hospital course"]):
        return "discharge_summary"
    elif any(term in text_lower for term in ["pathology", "biopsy", "histology", "cytology", "specimen", "tissue"]):
        return "pathology_report"
    else:
        return "generic"

ENHANCEMENT_PROMPTS = {
    "prescription": """You are a medical prescription expert. Correct OCR errors in medicine names, dosages and medical terms. Preserve numbers/dates. Format with in markdown format with clear sections for:
1. Patient Info
2. Medications
3. Instructions
4. Doctor Info

IMPORTANT: Always include medication dosages on the SAME LINE as the medication name (e.g., 'Medication Name - dosage' or 'Medication Name dosage'). Do NOT list dosages on separate lines. If a medication does not have dosage information, SKIP listing that medication entirely.

Do NOT include any annotations about corrections. Do NOT show what words were corrected or include text in parentheses like '(corrected to:)'. Only provide the final corrected text without any indication of what was changed.""",

    "lab_report": """You are a medical laboratory report expert. Correct OCR errors in test names, values, and medical terminology. Preserve all numbers, units, and reference ranges exactly as they appear. Format with in markdown format with clear sections for:
2. Test Results (with values and reference ranges)
3. Interpretation/Notes
4. Laboratory Information

Maintain the tabular structure of test results where possible. Do NOT include any annotations about corrections.""",

    "radiology": """You are a radiology report expert. Correct OCR errors in anatomical terms, findings, and medical terminology. Preserve the original structure of the report. Format with clear sections for:
1. Patient Information
2. Examination Type
3. Findings
4. Impression/Conclusion

Maintain any measurements exactly as they appear. Do NOT include any annotations about corrections.""",

    "insurance_claim": """You are an insurance claim form expert. Correct OCR errors in policy numbers, procedure codes, diagnosis codes, and medical terminology. Preserve all numbers, dates, and monetary values exactly as they appear. Format with clear sections for:
1. Patient/Subscriber Information
2. Insurance Provider Information
3. Service Details
4. Diagnosis and Procedure Codes
5. Charges and Payment Information

Maintain the form structure and alignment where possible. Preserve all insurance codes (CPT, ICD, HCPCS) exactly as they appear. Do NOT include any annotations about corrections.""",

    "discharge_summary": """You are a hospital discharge summary expert. Correct OCR errors in medical terminology, medications, and treatment plans. Preserve the original structure of the document. Format with clear sections for:
1. Patient Information
2. Admission/Discharge Dates
3. Diagnoses
4. Hospital Course
5. Discharge Medications
6. Follow-up Instructions

Maintain any bullet points or numbered lists. Preserve all medical codes and dates exactly as they appear. Do NOT include any annotations about corrections.""",

    "pathology_report": """You are a pathology report expert. Correct OCR errors in anatomical terms, specimen descriptions, and diagnostic terminology. Preserve the original structure of the report. Format with clear sections for:
1. Patient Information
2. Specimen Details
3. Gross Description
4. Microscopic Examination
5. Diagnosis/Impression

Maintain any technical measurements and values exactly as they appear. Preserve all medical terminology and pathology codes precisely. Do NOT include any annotations about corrections.""",

    "generic": """You are a medical document expert. Correct OCR errors in medical terminology, names of conditions, treatments, and medications. Preserve all numbers, dates, and measurements exactly as they appear. Maintain the original document structure while improving readability. Do NOT include any annotations about corrections."""
}

def enhance_medical_text(text, doc_type=None):
    doc_type = doc_type or detect_document_type(text)
    prompt = ENHANCEMENT_PROMPTS.get(doc_type, ENHANCEMENT_PROMPTS["generic"])
    
    try:
        chat_completion = groq_client.chat.completions.create(
            model="mixtral-8x7b-32768",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": text}
            ],
            temperature=0.1,
            max_tokens=1024
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        print(f"Error with Groq API: {e}")
        return text

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

# API Endpoints
@app.route('/')
def index():
    return jsonify({"ngrok_url": ngrok_url})

@app.route('/ocr', methods=['POST'])
def ocr():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    temp_path = os.path.join(tempfile.gettempdir(), file.filename)
    file.save(temp_path)
    model, processor = load_model()
    raw_text, _, _ = process_file(temp_path, model, processor)
    os.remove(temp_path)
    return jsonify({"raw_text": raw_text})

@app.route('/detect-document-type', methods=['POST'])
def detect_doc_type():
    data = request.json
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400
    doc_type = detect_document_type(data['text'])
    return jsonify({"document_type": doc_type})

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
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    temp_path = os.path.join(tempfile.gettempdir(), file.filename)
    file.save(temp_path)
    model, processor = load_model()
    raw_text, doc_type, enhanced_text = process_file(temp_path, model, processor)
    os.remove(temp_path)
    return jsonify({"raw_text": raw_text, "document_type": doc_type, "enhanced_text": enhanced_text})

@app.route('/process-batch', methods=['POST'])
def process_batch():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    temp_dir = tempfile.mkdtemp()
    zip_path = os.path.join(temp_dir, "input.zip")
    file.save(zip_path)

    extract_dir = os.path.join(temp_dir, "extracted")
    os.makedirs(extract_dir)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)

    model, processor = load_model()
    output_dir = os.path.join(temp_dir, "output")
    os.makedirs(output_dir)

    results = {}
    for root, _, files in os.walk(extract_dir):
        for f in files:
            file_path = os.path.join(root, f)
            raw_text, doc_type, enhanced_text = process_file(file_path, model, processor)
            results[f] = {"raw_text": raw_text, "document_type": doc_type, "enhanced_text": enhanced_text}
            with open(os.path.join(output_dir, f"{f}.txt"), 'w') as out_file:
                out_file.write(enhanced_text)

    output_zip = os.path.join(temp_dir, "output.zip")
    with zipfile.ZipFile(output_zip, 'w') as zipf:
        for root, _, files in os.walk(output_dir):
            for f in files:
                zipf.write(os.path.join(root, f), f)

    with open(output_zip, 'rb') as f:
        response = f.read()
    shutil.rmtree(temp_dir)
    return app.response_class(response, mimetype='application/zip', headers={"Content-Disposition": "attachment;filename=output.zip"})

if __name__ == '__main__':
    # Start ngrok
    ngrok.set_auth_token("2qKgNOz815jWWDAJD3WJga2VROT_sFasJqFrEu5MKBTVnvfn")
    ngrok_url = ngrok.connect(5000).public_url
    print(f"Public URL: {ngrok_url}")

    # Run Flask app
    app.run(port=5000)