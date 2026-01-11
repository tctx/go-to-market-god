from openai import OpenAI

YOUR_API_KEY = "INSERT API KEY HERE"

messages = [
    {
        "role": "system",
        "content": (
            "You are an artificial intelligence assistant and you need to "
            "engage in a helpful, detailed, polite conversation with a user."
        ),
    },
    {
        "role": "user",
        "content": "How many stars are in the universe?"
    },
]

# Use OpenAI's API endpoint
client = OpenAI(api_key=YOUR_API_KEY, base_url="https://api.openai.com")

# Chat completion without streaming (example using o1)
response = client.chat.completions.create(
    model="o1-2024-12-17",  # Actual API name for o1
    messages=messages,
)
print(response)

# Chat completion with streaming (example using o1-mini)
response_stream = client.chat.completions.create(
    model="o1-mini-2024-09-12",  # Actual API name for o1-mini
    messages=messages,
    stream=True,
)
for part in response_stream:
    print(part)

# Model Information

| Alias                          | Points to                              | Context Window    | Max Output Tokens | Model Type                                | Operational Status |
|--------------------------------|----------------------------------------|-------------------|-------------------|-------------------------------------------|-------------------|
| `gpt-4o`                       | `gpt-4o-2024-08-06`                     | 128,000 tokens    | N/A               | Chat Completion (Multimodal/Voice)        | ✅ Both Working |
| `chatgpt-4o-latest`            | Latest used in ChatGPT                 | 128,000 tokens    | N/A               | Chat Completion (Multimodal/Voice)        | ✅ Both Working |
| `gpt-4o-mini`                  | `gpt-4o-mini-2024-07-18`                | Unknown           | Unknown           | Chat Completion (Multimodal/Voice)        | ✅ Both Working |
| `o1`                         | `o1-2024-12-17`                        | 200,000 tokens    | 100,000 tokens    | Chat Completion                           | ❌ Not Available |
| `o1-mini`                    | `o1-mini-2024-09-12`                   | 128,000 tokens    | 65,536 tokens     | Chat Completion                           | ✅ Both Working |
| `o3-mini`                    | `o3-mini-2025-01-31`                   | 128,000 tokens    | 65,536 tokens     | Chat Completion                           | ❌ Not Available |
| `o1-preview`                 | `o1-preview-2024-09-12`                | 128,000 tokens    | 32,768 tokens     | Chat Completion                           | ✅ Both Working |
| `gpt-4o-realtime-preview`    | `gpt-4o-realtime-preview-2024-12-17`     | 128,000 tokens    | N/A               | Chat Completion (Realtime Preview)        | ❌ Wrong Endpoint |
| `gpt-4o-mini-realtime-preview` | `gpt-4o-mini-realtime-preview-2024-12-17` | Unknown           | Unknown           | Chat Completion (Realtime Preview, Mini)  | ❌ Wrong Endpoint |
| `gpt-4o-audio-preview`       | `gpt-4o-audio-preview-2024-12-17`        | 128,000 tokens    | N/A               | Chat Completion (Audio Preview)           | ❌ Audio Required |

