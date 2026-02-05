from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch
import re
import uuid
import time
import threading

# Last Updated: V163.4 Selective Playback & AI Metadata Fixes (Stable)

# ==========================================
# ⚙️ CONFIGURATION (LOCKED - DO NOT TOUCH)
# ==========================================

# Neural Generation Params (BART Optimized)
GEN_CONFIG = dict(
    num_beams=4,              
    length_penalty=2.0,
    early_stopping=True,
    no_repeat_ngram_size=3
)

# Output Constraints (Hard Capped)
SHORT_MIN = 60      # For intermediate chunks
SHORT_MAX = 120

FINAL_MIN = 120     # For final output
FINAL_MAX = 220

# Chunking Strategy Params
FIRST_CHUNK_TOKENS = 500    # REC 4: Reduced lead bias (550 -> 500)
OTHER_CHUNK_TOKENS = 700
MAX_CHUNKS = 8              # Safety cap to prevent timeouts

# ==========================================
# 🧠 MODEL LOADER
# ==========================================
print("Loading Model...")
model_name = "facebook/bart-large-cnn"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
model.eval() # REC 1: Disable dropout for deterministic output
print("Model Loaded & Set to Eval Mode!")

app = FastAPI()

class SummaryRequest(BaseModel):
    text: str
    mode: str = "half"  # "half" (Smart) or "short" (Quick)
    title: str = "Untitled Article"  # Article title for inbox display
    source: str = "Unknown" # Article source for inbox display

class DigestRequest(BaseModel):
    job_ids: list[str]

def clean_sentence_end(text: str) -> str:
    """ENSURE AUDIO SAFETY: REC 3 - Smarter cleanup that removes AI artifacting."""
    text = text.strip()
    if not text: return ""

    # Check for known T5 failure modes / hallucinations at the end
    garbage_markers = ["versiune", "»", "gra-", "pro bonie"]
    for marker in garbage_markers:
        if marker in text[-50:]: # Check only the end
            # If garbage found, aggressively cut back to the last dot before it
            last_dot = max(text.rfind('.'), text.rfind('!'), text.rfind('?'))
            if last_dot != -1:
                 return text[:last_dot+1]

    # Check the very end
    if text[-1] in ['.', '!', '?']:
        return text

    # Find the last "safe" anchor
    last_dot = max(text.rfind('.'), text.rfind('!'), text.rfind('?'))
    
    # If no punctuation at all, just add one
    if last_dot == -1:
        return text + "."

    # Remainder Analysis
    remainder = text[last_dot+1:].strip()
    
    # If remainder has weird brackets or is just a fragment
    if "(" in remainder and ")" not in remainder: # Unfinished bracket
        return text[:last_dot+1]

    # If the text AFTER the last dot is significant (> 20 chars), keep it and add a dot
    if len(remainder) > 20:
        return text.strip() + "."
    
    # Otherwise, it's likely a cutoff/junk fragment, so safe to cut
    return text[:last_dot+1]

def summarize_text(text: str, min_len: int, max_len: int) -> str:
    """Core generation wrapper with safety params."""
    # BART gets raw text
    input_text = text.strip()
    
    # Tokenize input
    inputs = tokenizer(
        input_text,
        return_tensors="pt",
        truncation=True,
        max_length=1024 # Model absolute limit
    )

    # REC 2: Disable Gradient Calculation (Save Memory/CPU)
    with torch.no_grad():
        summary_ids = model.generate(
            inputs.input_ids,
            min_length=min_len,
            max_length=max_len,
            **GEN_CONFIG
        )

    # Decode
    return tokenizer.decode(summary_ids[0], skip_special_tokens=True)

def compute_dynamic_length(input_len: int, ratio: float) -> tuple[int, int]:
    """
    DYNAMIC SCALING LOGIC (BOUNDED):
    Calculates target output length based on input size + ratio.
    Clamps results to strictly safe model bounds (T5-Base Cliff = ~280).
    """
    MAX_SAFE = 450 # BART: Large capacity (Can go to 500, keeping buffer)
    MIN_SAFE = 150 # BART: Needs room to write fluently
    
    target = int(input_len * ratio)
    
    # Handle "Runt Chunks" (Small inputs like the last paragraph)
    # If the target is smaller than our standard MIN_SAFE, we must lower the floor.
    if target < MIN_SAFE:
        lower_bound = max(30, int(target * 0.5)) # Allow small chunks to be summarized briefly
        upper_bound = target + 10                # Allow slight expansion
    else:
        # Standard Logic for Healthy Chunks
        lower_bound = max(MIN_SAFE, int(target * 0.85)) # REC: Raised floor (0.60 -> 0.85) to force verbosity
        upper_bound = min(MAX_SAFE, target)             
    
    # 🛡️ Safety: Ensure min < max is ALWAYS true
    if lower_bound >= upper_bound:
        lower_bound = max(10, upper_bound - 10)
        
    return lower_bound, upper_bound

def chunk_and_summarize(text: str, mode: str = "half") -> str:
    """
    Two-Pass Summarization with Bounded Dynamic Scaling.
    """
    tokens = tokenizer.encode(text)
    total_tokens = len(tokens)
    chunks = []
    
    # 1. PARAGRAPH-AWARE BUCKETING
    # We group paragraphs to form healthy chunks (~512 tokens).
    # This reduces AI calls (solving timeouts) while maintaining context.
    
    raw_paragraphs = text.split("\n")
    processed_chunks = []
    
    current_chunk_tokens = []
    current_chunk_size = 0
    TARGET_CHUNK_SIZE = 1000 # BART: Massive appetite (Leaves 24 for overhead)

    for para in raw_paragraphs:
        para = para.strip()
        if not para: continue
            
        p_tokens = tokenizer.encode(para, add_special_tokens=False)
        p_len = len(p_tokens)
        
        # Monster Paragraph Logic
        if p_len > TARGET_CHUNK_SIZE:
             for i in range(0, p_len, TARGET_CHUNK_SIZE):
                 sub_tokens = p_tokens[i : i + TARGET_CHUNK_SIZE]
                 processed_chunks.append(tokenizer.decode(sub_tokens, skip_special_tokens=True))
             continue

        # Bucket Limit Check
        if current_chunk_size + p_len > TARGET_CHUNK_SIZE:
            # Seal Bucket
            chunk_text = tokenizer.decode(current_chunk_tokens, skip_special_tokens=True)
            if chunk_text: processed_chunks.append(chunk_text)
            
            # Start New Bucket
            current_chunk_tokens = p_tokens
            current_chunk_size = p_len
        else:
            # Add to Bucket
            if current_chunk_tokens: current_chunk_tokens.extend(p_tokens)
            else: current_chunk_tokens = p_tokens
            current_chunk_size += p_len

    if current_chunk_tokens:
        chunk_text = tokenizer.decode(current_chunk_tokens, skip_special_tokens=True)
        processed_chunks.append(chunk_text)

    chunks = processed_chunks

    # 2. DETERMINE RATIOS
    if mode == "short":
        chunk_ratio = 0.25
    else: 
        # Smart Summary: High Retention (55%)
        chunk_ratio = 0.55 

    # 3. PASS 1 (Summarize Chunks)
    partial_summaries = []
    print(f"Processing {len(chunks)} grouped chunks from {total_tokens} tokens... Mode: {mode}", flush=True)
    
    for i, chunk in enumerate(chunks):
        c_len = len(tokenizer.encode(chunk))
        p1_min, p1_max = compute_dynamic_length(c_len, chunk_ratio)
        
        print(f"  Chunk {i+1}: {c_len} tokens -> Target {p1_min}-{p1_max}", flush=True)
        s = summarize_text(chunk, p1_min, p1_max)
        partial_summaries.append(s)

    # 4. FINALIZE
    combined_text = " ".join(partial_summaries)
    comb_len = len(tokenizer.encode(combined_text))
    
    retention_rate = (comb_len / total_tokens) * 100 if total_tokens > 0 else 0

    print(f"\n--- INTERMEDIATE STATS ---", flush=True)
    print(f"Total Tokens: {total_tokens}", flush=True)
    print(f"AI Summary Tokens: {comb_len}", flush=True)
    print(f"Retention %: {retention_rate:.1f}%", flush=True)
    print(f"--------------------------\n", flush=True)
    
    # FOR SMART MODE: We STOP here and return the detailed list.
    # Pass 2 causes timeouts and hallucinations on long text.
    if mode != "short":
        print(f"--- FINAL RESULT (MAP-ONLY) ---\n{combined_text[:500]}...\n-------------------------------", flush=True)
        return clean_sentence_end(combined_text)

    # For "Short" mode, we might still want to compress (Pass 2 logic below...)
    final_raw = summarize_text(combined_text, 100, 200) # Quick Recap Logic
    return clean_sentence_end(final_raw)

# ==========================================
#  ASYNC INFRASTRUCTURE
# ==========================================
JOBS = {} 

def process_summarization_job(job_id: str, text: str, mode: str):
    """
    Runs in a separate thread. Updates JOBS[job_id] when done.
    """
    print(f"[Job {job_id}] Started...")
    try:
        final_summary = chunk_and_summarize(text, mode)
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["output"] = final_summary
        print(f"[Job {job_id}] COMPLETED. Output len: {len(final_summary)}")
    except Exception as e:
        print(f"[Job {job_id}] ERROR: {str(e)}")
        JOBS[job_id]["status"] = "error"
        JOBS[job_id]["output"] = f"Error processing summary: {str(e)}"

# ==========================================
# 🚀 API ENDPOINTS
# ==========================================

@app.get("/")
def home():
    return {"status": "Active", "system": "InHouse-Inbox-V162.8"}

@app.post("/submit")
def submit_job(req: SummaryRequest):
    """
    ASYNC SUBMIT: Returns job_id immediately.
    """
    job_id = str(uuid.uuid4())
    
    # Initialize Job
    JOBS[job_id] = {
        "status": "processing",
        "output": None,
        "title": req.title,  # Store title for inbox display
        "source": req.source, # Store source for inbox display
        "created_at": time.time()
    }
    
    # Spawn Thread
    thread = threading.Thread(
        target=process_summarization_job,
        args=(job_id, req.text, req.mode)
    )
    thread.start()
    
    print(f"--- JOB SUBMITTED: {job_id} ---", flush=True)
    print(f"Title: {req.title}", flush=True)
    print(f"Source: {req.source}", flush=True)
    print(f"Mode: {req.mode}", flush=True)
    return {"job_id": job_id, "status": "processing"}

@app.get("/status/{job_id}")
def check_status(job_id: str):
    """
    POLL STATUS: Returns 'processing' or 'done' + output.
    """
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job_id,
        "status": job["status"],
        "output": job["output"]
    }

@app.delete("/delete/{job_id}")
def delete_job(job_id: str):
    if job_id in JOBS:
        del JOBS[job_id]
        return {"status": "deleted", "id": job_id}
    raise HTTPException(status_code=404, detail="Job not found")

@app.get("/completed_jobs")
def get_completed_jobs():
    """
    INBOX ENDPOINT: Returns list of all completed jobs.
    Used by News Reader to show "Green Icon" and populate inbox menu.
    """
    completed = []
    for job_id, job_data in JOBS.items():
        if job_data["status"] == "done":
            completed.append({
                "id": job_id,
                "title": job_data.get("title", "Untitled"),
                "source": job_data.get("source", "Unknown"),
                "timestamp": job_data.get("created_at", 0)
            })
    
    # Sort by oldest first (reading queue order)
    completed.sort(key=lambda x: x["timestamp"])
    return {"jobs": completed, "count": len(completed)}

@app.post("/digest")
def generate_digest(req: DigestRequest):
    """
    DAILY BRIEFING: Stitches multiple job outputs into one script.
    """
    combined_script = "Here is your Audio Briefing. "
    count = 0
    
    # Sort ids to verify order? No, trust the client order.
    for i, job_id in enumerate(req.job_ids):
        job = JOBS.get(job_id)
        if job and job["status"] == "done":
            source = job.get("source", "Unknown Source")
            title = job.get("title", "Untitled")
            text = job["output"]
            
            if count > 0:
                combined_script += f"\n\nNext up, from {source}: {title}. \n"
            else:
                combined_script += f"Starting with {source}: {title}. \n"
                
            combined_script += text
            count += 1
            
    if count == 0:
        return {"digest": "No processed summaries found."}
        
    combined_script += "\n\nThat concludes your briefing."
    return {"digest": combined_script}
    
# Legacy endpoint (Synchronous) for backward compatibility testing
@app.post("/summarize")
def summarize(req: SummaryRequest):
    try:
        return {"summary": chunk_and_summarize(req.text, req.mode)}
    except Exception as e:
        print(f"Sync Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
