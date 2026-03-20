"""
AOQRWE — PDF Analyzer & AI Question Generator
Run: python pdf_service.py
Requires: pip install flask flask-cors PyPDF2 google-generativeai
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os, json, re

app = Flask(__name__)
CORS(app)

def extract_pdf_text(file_stream):
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(file_stream)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text[:8000]  # Limit to 8000 chars
    except Exception as e:
        return f"Error reading PDF: {e}"

def generate_with_gemini(text, count):
    try:
        import google.generativeai as genai
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            return None
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = f"""
You are an exam question generator. Based on the following text, generate exactly {count} multiple choice questions.

TEXT:
{text}

Return ONLY a valid JSON array with this exact format (no markdown, no explanation):
[
  {{
    "text": "Question text here?",
    "options": {{"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"}},
    "answer": "A",
    "explanation": "Brief explanation of why this is correct."
  }}
]
Generate exactly {count} questions.
"""
        response = model.generate_content(prompt)
        raw = response.text.strip()
        # Extract JSON array from response
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        return json.loads(raw)
    except Exception as e:
        print(f"Gemini error: {e}")
        return None

def generate_mock_questions(text, count):
    """Fallback when no API key is set"""
    words = text.split()[:50]
    questions = []
    for i in range(count):
        questions.append({
            "text": f"Based on the document, what is concept #{i+1}?",
            "options": {
                "A": f"Concept related to: {' '.join(words[i*3:i*3+3]) if len(words) > i*3+3 else 'topic A'}",
                "B": "An unrelated definition",
                "C": "A different explanation",
                "D": "None of the above"
            },
            "answer": "A",
            "explanation": "This answer relates directly to the content found in the uploaded document."
        })
    return questions

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "AOQRWE PDF Service"})

@app.route('/analyze-pdf', methods=['POST'])
def analyze_pdf():
    try:
        if 'pdf' not in request.files:
            return jsonify({"error": "No PDF file uploaded"}), 400
        
        pdf_file = request.files['pdf']
        count = int(request.form.get('count', 5))
        count = max(1, min(30, count))  # Clamp between 1-30
        
        # Extract text
        text = extract_pdf_text(pdf_file.stream)
        if not text or len(text.strip()) < 50:
            return jsonify({"error": "Could not extract readable text from PDF"}), 400
        
        # Try Gemini first
        questions = generate_with_gemini(text, count)
        
        # Fallback to mock
        if not questions:
            questions = generate_mock_questions(text, count)
        
        return jsonify(questions)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("AOQRWE PDF Service starting on http://localhost:5000")
    print("Set GEMINI_API_KEY env variable for AI generation.")
    print("=" * 50)
    app.run(debug=True, port=5000)
