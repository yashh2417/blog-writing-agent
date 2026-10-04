import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

llm = ChatGoogleGenerativeAI(
    model=os.getenv("LLM_MODEL", "gemini-3.5-flash-lite"),
    timeout=180
)
