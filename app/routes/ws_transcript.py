from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from app.auth import verify_token
from app.models import User, Meeting, Transcript
from app.database import get_db
from app.config import settings
import websockets
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"


def get_user_from_token(token: str, db: Session) -> User | None:
    user_id = verify_token(token)
    if not user_id:
        return None
    return db.query(User).filter(User.user_id == user_id).first()


@router.websocket("/ws/transcript/{meeting_id}")
async def websocket_transcript(
    websocket: WebSocket,
    meeting_id: str,
    token: str,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint that proxies audio chunks to OpenAI Realtime API
    and streams transcription back to the client in real time.

    Client sends:  { "type": "audio_chunk", "audio": "<base64 PCM16 24kHz mono>" }
    Client sends:  { "type": "stop" }
    Server sends:  { "type": "transcript",      "text": "...", "is_final": true/false }
    Server sends:  { "type": "speech_started" }
    Server sends:  { "type": "speech_stopped"  }
    Server sends:  { "type": "error",           "message": "..." }
    """
    # Authenticate via query param token
    user = get_user_from_token(token, db)
    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Verify meeting belongs to user
    meeting = db.query(Meeting).filter(
        Meeting.meeting_id == meeting_id,
        Meeting.user_id == user.user_id
    ).first()
    if not meeting:
        await websocket.close(code=4004, reason="Meeting not found")
        return

    await websocket.accept()
    logger.info(f"WebSocket opened: meeting={meeting_id} user={user.user_id}")

    transcript_accumulator = []

    try:
        async with websockets.connect(
            OPENAI_REALTIME_URL,
            extra_headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "OpenAI-Beta": "realtime=v1"
            }
        ) as openai_ws:

            # Configure session — transcription only, no AI response generation
            await openai_ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "modalities": ["text"],
                    "input_audio_format": "pcm16",
                    "input_audio_transcription": {
                        "model": "whisper-1"
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 600
                    },
                    "instructions": "Transcribe the audio accurately. Do not respond or generate any output other than transcription.",
                    "temperature": 0.6
                }
            }))

            async def forward_client_to_openai():
                """Receive audio chunks from browser and forward to OpenAI."""
                try:
                    async for message in websocket.iter_text():
                        data = json.loads(message)
                        msg_type = data.get("type")

                        if msg_type == "audio_chunk":
                            await openai_ws.send(json.dumps({
                                "type": "input_audio_buffer.append",
                                "audio": data["audio"]
                            }))

                        elif msg_type == "stop":
                            # Commit any remaining audio in the buffer
                            await openai_ws.send(json.dumps({
                                "type": "input_audio_buffer.commit"
                            }))
                            logger.info("Audio stream stopped by client")
                            break

                except WebSocketDisconnect:
                    logger.info("Client disconnected from WebSocket")

            async def forward_openai_to_client():
                """Receive transcription events from OpenAI and send to browser."""
                try:
                    async for raw_msg in openai_ws:
                        event = json.loads(raw_msg)
                        event_type = event.get("type", "")

                        # Speech activity signals
                        if event_type == "input_audio_buffer.speech_started":
                            await websocket.send_json({"type": "speech_started"})

                        elif event_type == "input_audio_buffer.speech_stopped":
                            await websocket.send_json({"type": "speech_stopped"})

                        # Final committed transcript for a turn
                        elif event_type == "conversation.item.input_audio_transcription.completed":
                            text = event.get("transcript", "").strip()
                            if text:
                                transcript_accumulator.append(text)
                                logger.info(f"Transcript: {text}")

                                # Persist to database
                                ts_ms = len(transcript_accumulator) * 3000
                                db_line = Transcript(
                                    meeting_id=meeting_id,
                                    speaker="Speaker",
                                    text=text,
                                    timestamp_ms=ts_ms,
                                    confidence=0.95
                                )
                                db.add(db_line)
                                db.commit()

                                await websocket.send_json({
                                    "type": "transcript",
                                    "text": text,
                                    "timestamp": f"{ts_ms // 60000}:{(ts_ms % 60000) // 1000:02d}",
                                    "is_final": True
                                })

                        # Streaming partial transcript (delta)
                        elif event_type == "response.audio_transcript.delta":
                            delta = event.get("delta", "")
                            if delta:
                                await websocket.send_json({
                                    "type": "transcript",
                                    "text": delta,
                                    "is_final": False
                                })

                        # Log errors from OpenAI
                        elif event_type == "error":
                            error_msg = event.get("error", {}).get("message", "Unknown error")
                            logger.error(f"OpenAI Realtime error: {error_msg}")
                            await websocket.send_json({
                                "type": "error",
                                "message": error_msg
                            })

                except Exception as e:
                    logger.error(f"Error receiving from OpenAI: {e}")

            # Run both directions concurrently
            await asyncio.gather(
                forward_client_to_openai(),
                forward_openai_to_client()
            )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: meeting={meeting_id}")

    except websockets.exceptions.WebSocketException as e:
        logger.error(f"OpenAI WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": "Connection to transcription service failed"})
        except Exception:
            pass

    except Exception as e:
        logger.error(f"WebSocket handler error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass

    finally:
        logger.info(f"WebSocket closed: meeting={meeting_id}, {len(transcript_accumulator)} transcript lines saved")
