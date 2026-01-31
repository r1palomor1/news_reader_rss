from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch
import re

# Last Updated: V149.5 (Paragraph Chunking Logic)

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
    DYNAMIC SCALING LOGIC (BOUNDED):
    Calculates target output length based on input size + ratio.
    Clamps results to strictly safe model bounds (T5-Base Cliff = ~280).
    """
    MAX_SAFE = 280 # REC: T5 stability cliff. Going higher risks hallucinations.
    MIN_SAFE = 120 # REC: Ensure we never output "tweet-sized" summaries.
    
    target = int(input_len * ratio)
    
    # Handle "Runt Chunks" (Small inputs like the last paragraph)
    # If the target is smaller than our standard MIN_SAFE, we must lower the floor.
    if target < MIN_SAFE:
        lower_bound = max(30, int(target * 0.5)) # Allow small chunks to be summarized briefly
        upper_bound = target + 10                # Allow slight expansion
    else:
        # Standard Logic for Healthy Chunks
        lower_bound = max(MIN_SAFE, int(target * 0.60)) 
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
    TARGET_CHUNK_SIZE = 512 # Sweet spot for T5-Base

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
        # Smart Summary: High Retention (45%)
        chunk_ratio = 0.45 

    # 3. PASS 1 (Summarize Chunks)
    partial_summaries = []
    print(f"Processing {len(chunks)} grouped chunks from {total_tokens} tokens... Mode: {mode}")
    
    for i, chunk in enumerate(chunks):
        c_len = len(tokenizer.encode(chunk))
        p1_min, p1_max = compute_dynamic_length(c_len, chunk_ratio)
        
        print(f"  Chunk {i+1}: {c_len} tokens -> Target {p1_min}-{p1_max}")
        s = summarize_text(chunk, p1_min, p1_max)
        partial_summaries.append(s)

    # 4. FINALIZE
    combined_text = " ".join(partial_summaries)
    comb_len = len(tokenizer.encode(combined_text))
    
    print(f"\n--- INTERMEDIATE STATS ---")
    print(f"Total Chunks: {len(chunks)}")
    print(f"Combined Output Tokens: {comb_len}")
    print(f"--------------------------\n")
    
    # FOR SMART MODE: We STOP here and return the detailed list.
    # Pass 2 causes timeouts and hallucinations on long text.
    if mode != "short":
        print(f"--- FINAL RESULT (MAP-ONLY) ---\n{combined_text[:500]}...\n-------------------------------")
        return clean_sentence_end(combined_text)

    # For "Short" mode, we might still want to compress (Pass 2 logic below...)
    final_raw = summarize_text(combined_text, 100, 200) # Quick Recap Logic
    return clean_sentence_end(final_raw)

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
        # DEBUG: Show invisible characters to verify newlines
        print(f"Input Raw Repr: {repr(req.text[:500])}...")
        
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
