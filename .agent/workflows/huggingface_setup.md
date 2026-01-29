---
description: How to setup and deploy pyAutoSummarizer on Hugging Face Spaces
---

# 🚀 Hugging Face Deployment Workflow

This guide will take you from zero to a running AI Summarizer API on Hugging Face.

## 1. Account Setup
1.  Go to **[huggingface.co/join](https://huggingface.co/join)**.
2.  Sign up (email/password).
3.  **Verify your email** (Critical: You cannot create Spaces without verification).

## 2. Create Your Space (The Server)
1.  Click your **Profile Picture** (top right) -> **New Space**.
2.  **Space Name:** `smart-news-summarizer` (or similar).
3.  **License:** `MIT`.
4.  **SDK:** Select **Docker** (This gives us full control over the huge libraries).
    *   *Why Docker?* It's more stable for system-level dependencies than the default Gradio SDK for this specific task.
5.  **Space Hardware:** Select **Free** (CPU basic • 2 vCPU • 16GB RAM).
6.  Click **Create Space**.

## 3. The Code Files
You will see a screen that looks like a GitHub repo. You need to create/upload **3 specific files**.
*Use the "Files" tab -> "Add file" -> "Create new file" for each of these.*

### File 1: `requirements.txt`
This tells the server what to install.
```text
fastapi>=0.68.0
uvicorn>=0.15.0
pydantic>=1.8.0
transformers>=4.30.0
torch>=2.0.0 --index-url https://download.pytorch.org/whl/cpu
pyAutoSummarizer>=1.0.1
```

### File 2: `Dockerfile`
This tells the server how to build the application.
```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
# Use the CPU-only index for torch to save massive bandwidth/space
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy logic
COPY app.py .

# Create cache directory for models so they persist if possible (or just download cleanly)
RUN mkdir -p /app/cache
ENV TRANSFORMERS_CACHE=/app/cache

# Run the app
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
```

### File 3: `app.py`
The actual API logic.
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pyautosum import pyAutoSummarizer
import uvicorn
import os

app = FastAPI()

# Initialize Model (Lazy load or startup load)
print("⏳ Loading Model... this may take a moment cold start...")
try:
    # Using t5-small for speed/size balance on CPU
    model = pyAutoSummarizer(model_choice='t5-small')
    print("✅ Model Loaded!")
except Exception as e:
    print(f"❌ Model Load Error: {e}")
    model = None

class ArticleRequest(BaseModel):
    text: str
    mode: str = "half" # full, half, short

@app.get("/")
def home():
    return {"status": "running", "msg": "Send POST to /summarize"}

@app.post("/summarize")
def summarize_article(req: ArticleRequest):
    if not model:
        raise HTTPException(status_code=500, detail="Model not initialized")
    
    # Input validation
    if not req.text or len(req.text) < 50:
        return {"summary": req.text, "msg": "Text too short"}

    try:
        if req.mode == "full":
             return {"summary": req.text}
        
        # Calculate ratio based on mode
        target_ratio = 0.5
        if req.mode == "short":
            target_ratio = 0.25
        
        # Run Summary
        summary = model.summarize(req.text, ratio=target_ratio)
        return {"summary": summary}
        
    except Exception as e:
        return {"error": str(e), "summary": req.text} # Fallback to original

```

## 4. Deploy & Verify
1.  Once all 3 files are created, the Space will automatically change status to **"Building"**.
2.  Click the **"App"** tab to verify logs.
3.  Wait ~3-5 minutes for the first build (it downloads PyTorch).
4.  Once it says **"Running"**, click the **three dots** (top right of App window) -> **Embed this space**.
5.  Copy the **Direct URL**. It will look like:
    `https://palom-smart-news-summarizer.hf.space`

## 5. Next Step
Return to the chat with this URL, and we will update the Scriptable App to send data to it!
