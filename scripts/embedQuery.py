import sys
import json
from sentence_transformers import SentenceTransformer

def main():
    if len(sys.argv) < 2:
        print(json.dumps([]))
        return
        
    query = sys.argv[1]
    
    # Load model (uses local cached weights, super fast)
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    # Generate embedding
    embedding = model.encode(query, show_progress_bar=False)
    
    # Print as JSON list
    print(json.dumps(list(embedding.tolist())))

if __name__ == '__main__':
    main()
