import requests
import json
import logging
from openai import OpenAI
from app.config import settings
from typing import List, Dict

logger = logging.getLogger(__name__)

class OllamaLLM:
    """LLM service for summarization and action item extraction.
    Uses OpenAI GPT-3.5-turbo as primary, falls back to Ollama if available."""

    def __init__(self):
        self.ollama_url = settings.OLLAMA_API_URL
        self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

    async def generate_summary(self, transcript: str) -> str:
        """Generate executive summary from transcript"""
        if not transcript or not transcript.strip():
            return "No transcript content available to summarize."

        # Try OpenAI first
        try:
            logger.info("Starting summary generation via OpenAI")

            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert meeting summarizer. Analyze the meeting transcript "
                            "and provide a concise executive summary with these sections:\n"
                            "1. CRITICAL ITEMS (if any)\n"
                            "2. KEY DECISIONS\n"
                            "3. ACTION HIGHLIGHTS\n"
                            "4. OTHER NOTES\n\n"
                            "Keep it brief and professional. Use UPPERCASE for important points."
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Summarize this meeting transcript:\n\n{transcript}"
                    }
                ],
                temperature=0.7,
                max_tokens=500
            )

            summary = response.choices[0].message.content.strip()
            logger.info("Summary generation complete via OpenAI")
            return summary

        except Exception as openai_err:
            logger.warning(f"OpenAI summary failed: {openai_err}, trying Ollama...")

        # Fallback to Ollama
        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": "llama3",
                    "prompt": f"Summarize this meeting transcript:\n\n{transcript}\n\nProvide a clear, structured summary.",
                    "system": "You are an expert meeting summarizer. Be concise and professional.",
                    "stream": False,
                    "temperature": 0.7
                },
                timeout=120
            )

            if response.status_code == 200:
                summary = response.json().get("response", "").strip()
                logger.info("Summary generation complete via Ollama")
                return summary
            else:
                logger.error(f"Ollama error: {response.status_code}")

        except Exception as ollama_err:
            logger.error(f"Ollama summary failed: {ollama_err}")

        return "Summary could not be generated. Please check your API configuration."

    async def extract_action_items(self, transcript: str) -> List[Dict]:
        """Extract action items from transcript"""
        if not transcript or not transcript.strip():
            return []

        # Try OpenAI first
        try:
            logger.info("Starting action item extraction via OpenAI")

            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert at extracting action items from meeting transcripts. "
                            "Extract all tasks, commitments, and decisions that require action. "
                            "Return ONLY a valid JSON array with no extra text. "
                            "Each item must have: title (string), assigned_to (string or null), "
                            "due_date (YYYY-MM-DD string or null), priority (high/medium/low), "
                            "description (string or null)."
                        )
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Extract action items from this transcript and return ONLY a JSON array:\n\n"
                            f"{transcript}\n\n"
                            f'Format: [{{"title":"...", "assigned_to":null, "due_date":null, "priority":"medium", "description":null}}]'
                        )
                    }
                ],
                temperature=0.3,
                max_tokens=800
            )

            response_text = response.choices[0].message.content.strip()

            # Parse JSON array from response
            start_idx = response_text.find("[")
            end_idx = response_text.rfind("]") + 1
            if start_idx != -1 and end_idx > start_idx:
                json_str = response_text[start_idx:end_idx]
                action_items = json.loads(json_str)
                logger.info(f"Extracted {len(action_items)} action items via OpenAI")
                return action_items

        except json.JSONDecodeError as je:
            logger.warning(f"Failed to parse action items JSON: {je}")
        except Exception as openai_err:
            logger.warning(f"OpenAI action item extraction failed: {openai_err}, trying Ollama...")

        # Fallback to Ollama
        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": "llama3",
                    "prompt": (
                        f"Extract action items from this meeting transcript. "
                        f"Return ONLY a valid JSON array:\n\n{transcript}\n\n"
                        f'Format: [{{"title":"task","assigned_to":null,"due_date":null,"priority":"medium"}}]'
                    ),
                    "stream": False,
                    "temperature": 0.3
                },
                timeout=120
            )

            if response.status_code == 200:
                response_text = response.json().get("response", "").strip()
                start_idx = response_text.find("[")
                end_idx = response_text.rfind("]") + 1
                if start_idx != -1 and end_idx > start_idx:
                    action_items = json.loads(response_text[start_idx:end_idx])
                    logger.info(f"Extracted {len(action_items)} action items via Ollama")
                    return action_items

        except Exception as ollama_err:
            logger.error(f"Ollama action item extraction failed: {ollama_err}")

        return []
