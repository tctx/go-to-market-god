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
        "content": (
            "How many stars are in the universe?"
        ),
    },
]

client = OpenAI(api_key=YOUR_API_KEY, base_url="https://api.perplexity.ai")

# chat completion without streaming
response = client.chat.completions.create(
    model="sonar-pro",
    messages=messages,
)
print(response)

# chat completion with streaming
response_stream = client.chat.completions.create(
    model="sonar-pro",
    messages=messages,
    stream=True,
)
for response in response_stream:
    print(response)



# Model Information

| Model             | Context Length | Model Type       |
|------------------|---------------|-----------------|
| sonar-reasoning  | 127k          | Chat Completion |
| sonar-pro       | 200k          | Chat Completion |
| sonar           | 127k          | Chat Completion |

- **sonar-pro** has a max output token limit of **8k**.
- **sonar-reasoning** outputs **CoT (Chain of Thought)** in its response as well.
