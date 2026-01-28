from http.server import BaseHTTPRequestHandler
import json
import os
import nltk

# 1. Setup NLTK Path to /tmp (Writable in Vercel Lambda)
nltk_data_path = "/tmp/nltk_data"
if not os.path.exists(nltk_data_path):
    os.makedirs(nltk_data_path)
nltk.data.path.append(nltk_data_path)

# 2. Function to Ensure Tokenizer Exists
def ensure_punkt():
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        print("Downloading punkt tokenizer...")
        nltk.download('punkt', download_dir=nltk_data_path)
        # Also need punkt_tab for newer nltk versions sometimes, but punkt is standard
        nltk.download('punkt_tab', download_dir=nltk_data_path)

# 3. Sumy Imports (Delayed to ensure NLTK is ready)
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer
from sumy.nlp.stemmers import Stemmer
from sumy.utils import get_stop_words

class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write("Vercel Summarizer is Ready! Send a POST request with 'text' in the body.".encode('utf-8'))

    def do_POST(self):
        # 1. Ensure dependencies
        try:
            ensure_punkt()
        except Exception as e:
            self.send_error(500, f"NLTK Setup Error: {str(e)}")
            return

        # 2. Parse Request
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            body = json.loads(post_data.decode('utf-8'))
            text = body.get('text', '')
            sentence_count = body.get('sentences', 5)
            
            if not text:
                self.send_error(400, "Missing 'text' field in JSON body")
                return
                
        except Exception as e:
            self.send_error(400, f"Request Parsing Error: {str(e)}")
            return

        # 3. Run Summarization
        try:
            LANGUAGE = "english"
            parser = PlaintextParser.from_string(text, Tokenizer(LANGUAGE))
            stemmer = Stemmer(LANGUAGE)

            summarizer = LsaSummarizer(stemmer)
            summarizer.stop_words = get_stop_words(LANGUAGE)

            summary_sentences = summarizer(parser.document, sentence_count)
            
            # Combine sentences into a single string
            summary_text = " ".join([str(s) for s in summary_sentences])

            # 4. Return Response
            response_data = {
                "summary": summary_text,
                "dataset_sentences": len(parser.document.sentences),
                "summary_sentences": len(summary_sentences)
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
             self.send_error(500, f"Summarization Error: {str(e)}")

