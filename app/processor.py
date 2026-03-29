import os
import logging
from pydub import AudioSegment
import uuid
import tempfile

logger = logging.getLogger(__name__)

class AudioProcessor:
    """Audio format conversion and processing"""

    def __init__(self):
        self.temp_dir = tempfile.gettempdir()

    async def convert_to_mp3(self, audio_blob: bytes, from_format: str = "webm") -> str:
        """
        Convert audio blob to MP3 format
        Returns path to converted MP3 file
        """
        try:
            logger.info(f"Converting audio from {from_format} to MP3")

            # Create temporary input file
            temp_input_path = os.path.join(
                self.temp_dir,
                f"audio_input_{uuid.uuid4().hex}.{from_format}"
            )
            with open(temp_input_path, "wb") as f:
                f.write(audio_blob)

            # Convert using pydub
            audio = AudioSegment.from_file(temp_input_path, format=from_format)

            # Save as MP3
            temp_output_path = os.path.join(
                self.temp_dir,
                f"audio_{uuid.uuid4().hex}.mp3"
            )
            audio.export(temp_output_path, format="mp3")

            # Clean up input file
            if os.path.exists(temp_input_path):
                os.remove(temp_input_path)

            logger.info(f"Audio conversion complete: {temp_output_path}")
            return temp_output_path

        except Exception as e:
            logger.error(f"Audio conversion error: {str(e)}")
            raise Exception(f"Failed to convert audio: {str(e)}")

    async def cleanup_temp_file(self, file_path: str):
        """Delete temporary audio file"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Cleaned up temp file: {file_path}")
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")
