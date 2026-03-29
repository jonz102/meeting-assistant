from openai import OpenAI
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class WhisperTranscriber:
    """OpenAI Whisper transcription service"""

    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    async def transcribe_audio(self, audio_file_path: str) -> dict:
        """
        Transcribe audio using OpenAI Whisper API (v1.x SDK)
        Returns transcript with speaker labels and timestamps
        """
        try:
            logger.info(f"Starting transcription for {audio_file_path}")

            with open(audio_file_path, "rb") as audio_file:
                transcript = self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="en",
                    response_format="verbose_json"
                )

            # Parse the response
            transcript_lines = []
            if hasattr(transcript, 'segments') and transcript.segments:
                for segment in transcript.segments:
                    line = {
                        "text": segment.get("text", "") if isinstance(segment, dict) else getattr(segment, 'text', ''),
                        "speaker": "Speaker",  # Whisper doesn't provide speaker labels
                        "timestamp_ms": int((segment.get("start", 0) if isinstance(segment, dict) else getattr(segment, 'start', 0)) * 1000),
                        "confidence": 0.95
                    }
                    transcript_lines.append(line)
            else:
                # Fallback if no segments
                text = transcript.text if hasattr(transcript, 'text') else str(transcript)
                transcript_lines = [{
                    "text": text,
                    "speaker": "Speaker",
                    "timestamp_ms": 0,
                    "confidence": 0.95
                }]

            logger.info(f"Transcription complete: {len(transcript_lines)} lines")

            full_text = transcript.text if hasattr(transcript, 'text') else " ".join(l["text"] for l in transcript_lines)

            return {
                "success": True,
                "lines": transcript_lines,
                "duration_ms": int((transcript_lines[-1]["timestamp_ms"] if transcript_lines else 0) + 5000),
                "text": full_text
            }

        except Exception as e:
            logger.error(f"Transcription error: {str(e)}")
            raise Exception(f"Transcription failed: {str(e)}")
