import os
import requests
from dotenv import load_dotenv
import time

# Load environment variables
load_dotenv()

api_key = os.getenv('OPENAI_API_KEY')
if not api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

def create_messages(query, model):
    """Create messages based on model type"""
    messages = []
    
    # Add system message for models that support it
    if not any(model.startswith(prefix) for prefix in ['o1-mini', 'o3-mini', 'o1-preview']):
        messages.append({
            "role": "system",
            "content": "You are a helpful assistant that provides accurate information about people and events."
        })
    
    # Add user message
    messages.append({
        "role": "user",
        "content": query
    })
    
    return messages

def test_model(model, alias=""):
    print(f"\nTesting model: {model}")
    if alias:
        print(f"(Alias: {alias})")
    print("=" * 80)
    
    payload = {
        "model": model,
        "messages": create_messages(query, model)
    }

    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers=headers,
        json=payload
    )

    operational = False
    if response.status_code == 200:
        result = response.json()
        print("Success!")
        print("-" * 80)
        print(result['choices'][0]['message']['content'])
        print("-" * 80)
        operational = True
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
    print("\n")
    return operational

# Models to test from the documentation
models = [
    ("gpt-4o", "gpt-4o-2024-08-06"),
    ("chatgpt-4o-latest", "gpt-4o-2024-08-06"),  # Points to latest used in ChatGPT
    ("gpt-4o-mini", "gpt-4o-mini-2024-07-18"),
    ("o1", "o1-2024-12-17"),
    ("o1-mini", "o1-mini-2024-09-12"),
    ("o3-mini", "o3-mini-2025-01-31"),
    ("o1-preview", "o1-preview-2024-09-12"),
    ("gpt-4o-realtime-preview", "gpt-4o-realtime-preview-2024-12-17"),
    ("gpt-4o-mini-realtime-preview", "gpt-4o-mini-realtime-preview-2024-12-17"),
    ("gpt-4o-audio-preview", "gpt-4o-audio-preview-2024-12-17")
]

query = "Where did Marc Andreessen (pmarca) go to school?"

print("Testing all models from documentation...")
print("=" * 80)

results = []
for alias, points_to in models:
    # Test the alias first
    alias_operational = test_model(alias, "")
    time.sleep(1)
    # Then test what it points to
    points_to_operational = test_model(points_to, alias)
    time.sleep(1)
    results.append((alias, points_to, alias_operational, points_to_operational))

# Print summary table
print("\nResults Summary:")
print("=" * 100)
print(f"{'Alias':<30} | {'Points To':<40} | {'Operational':<20}")
print("-" * 100)
for alias, points_to, alias_op, points_to_op in results:
    status = f"Alias: {'Yes' if alias_op else 'No'}, Points To: {'Yes' if points_to_op else 'No'}"
    print(f"{alias:<30} | {points_to:<40} | {status:<20}")
print("=" * 100) 