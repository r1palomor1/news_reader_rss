from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch
import re

# ==========================================
# ⚙️ CONFIGURATION (LOCKED - DO NOT TOUCH)
# ==========================================

# Neural Generation Params (Anti-Gibberish)
GEN_CONFIG = dict(
    num_beams=3,              # REC: Balance Speed (2) vs Quality (5). 3 is the sweet spot.
    repetition_penalty=2.5,
    no_repeat_ngram_size=3,
    length_penalty=1.0,
    early_stopping=True
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
model_name = "t5-base"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
model.eval() # REC 1: Disable dropout for deterministic output
print("Model Loaded & Set to Eval Mode!")

app = FastAPI()

class SummaryRequest(BaseModel):
    text: str
    mode: str = "half"  # "half" (Smart) or "short" (Quick)

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
    input_text = "summarize: " + text.strip()
    
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
    DYNAMIC SCALING LOGIC:
    Calculates target output length based on input size + ratio.
    Clamps results to model safety bounds (T5-Base limits).
    """
    MAX_SAFE = 300 # Max tokens T5-Base can consistently generate without loop-failure
    MIN_SAFE = 60
    
    target = int(input_len * ratio)
    
    # Calculate bounds
    lower_bound = max(MIN_SAFE, int(target * 0.60)) # Allow some flexibility downwards
    upper_bound = min(MAX_SAFE, target)             # Never exceed safe model limit
    
    # Ensure min < max
    if lower_bound >= upper_bound:
        lower_bound = max(MIN_SAFE, upper_bound - 10)
        
    return lower_bound, upper_bound

def chunk_and_summarize(text: str, mode: str = "half") -> str:
    """
    Two-Pass Summarization with Dynamic Scaling.
    """
    tokens = tokenizer.encode(text)
    total_tokens = len(tokens)
    chunks = []
    
    # 1. SPLIT (Token level)
    idx = 0
    first = True
    while idx < total_tokens and len(chunks) < MAX_CHUNKS:
        size = FIRST_CHUNK_TOKENS if first else OTHER_CHUNK_TOKENS
        chunk_tokens = tokens[idx : idx + size]
        chunk_text = tokenizer.decode(chunk_tokens, skip_special_tokens=True)
        chunks.append(chunk_text)
        idx += size
        first = False

    # 2. DETERMINE RATIOS
    if mode == "short":
        # Quick Recap: Aggressive compression
        chunk_ratio = 0.25 # Keep 25% of chunks
        final_ratio = 0.20 # Keep 20% of total
    else: 
        # Smart Summary: Minimal compression
        chunk_ratio = 0.60 # Keep 60% of chunks (Maximum Detail)
        final_ratio = 0.50 # Aim for 50% of original, clamped at MAX_SAFE

    # 3. PASS 1 (Summarize Chunks)
    partial_summaries = []
    print(f"Processing {len(chunks)} chunks from {total_tokens} tokens... Mode: {mode}")
    
    for i, chunk in enumerate(chunks):
        # Measure this specific chunk
        c_len = len(tokenizer.encode(chunk))
        p1_min, p1_max = compute_dynamic_length(c_len, chunk_ratio)
        
        # Log the dynamic decision
        print(f"  Chunk {i+1}: {c_len} tokens -> Target {p1_min}-{p1_max}")
        
        s = summarize_text(chunk, p1_min, p1_max)
        partial_summaries.append(s)

    # 4. PASS 2 (Reduce)
    combined_text = " ".join(partial_summaries)
    comb_len = len(tokenizer.encode(combined_text))
    
    # Calculate Final Targets based on the COMBINED text size
    # logical_target = total_tokens * final_ratio (The User Dream)
    # real_target = comb_len * 0.7 (The Physical Reality check)
    p2_min, p2_max = compute_dynamic_length(comb_len, 0.70) 
    
    # Hard override: If mode is "half", force near-max usage
    if mode == "half":
        p2_max = 300 # Force it to use the full capacity
        
    print(f"  Final Pass: {comb_len} tokens (Intermediate) -> Target {p2_min}-{p2_max}")
    
    final_raw = summarize_text(combined_text, p2_min, p2_max)
    
    # METRICS: Raw
    raw_tokens = len(tokenizer.encode(final_raw))
    raw_pct = (raw_tokens / total_tokens) * 100
    print(f"--- RAW AI SUMMARY (BEFORE CLEANING) ---\nTokens: {raw_tokens} ({raw_pct:.1f}%)\n{final_raw}\n----------------------------------------")

    # 5. SAFETY
    cleaned = clean_sentence_end(final_raw)
    
    # METRICS: Cleaned
    clean_tokens = len(tokenizer.encode(cleaned))
    clean_pct = (clean_tokens / total_tokens) * 100
    print(f"--- CLEANED SUMMARY ---\nTokens: {clean_tokens} ({clean_pct:.1f}%)\n{cleaned}\n----------------------------------------")
    return cleaned

# ==========================================
# 🚀 API ENDPOINT
# ==========================================

@app.get("/")
def home():
    return {"status": "Active", "system": "Recursive-T5-Base-V3-Debug"}

@app.post("/summarize")
def summarize(req: SummaryRequest):
    try:
        # 1. Input Validation
        print(f"--- REQUEST RECEIVED ---")
        token_count = len(tokenizer.encode(req.text)) # REC 5: Log Tokens
        print(f"Input Length: {len(req.text)} chars | Tokens: {token_count}")
        print(f"Input Preview: {req.text}...")
        
        if not req.text or len(req.text.strip()) < 100:
            return {
                "summary": "The article is too short to generate a meaningful summary.",
                "original_counts": 0,
                "token_count": token_count
            }

        # 2. Execution
        final_summary = chunk_and_summarize(req.text, req.mode)

        # 3. Return
        return {
            "summary": final_summary,
            "chunks_processed": True,
            "token_count": token_count,
            "status": "success"
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        # Return a safe fallback error for the UI
        return {"error": str(e), "summary": "An error occurred during AI processing."}
