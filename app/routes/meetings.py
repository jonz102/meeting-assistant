from fastapi import APIRouter, HTTPException, status, Depends, Header, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date as date_type
from app.models import User, Meeting, Transcript, ActionItem
from app.transcriber import WhisperTranscriber
from app.summarizer import OllamaLLM
from app.mailer import EmailNotifier
from app.processor import AudioProcessor
from app.auth import verify_token
from app.database import get_db
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/meetings", tags=["meetings"])

# Pydantic models
class ActionItemResponse(BaseModel):
    action_id: str
    title: str
    description: Optional[str]
    assigned_to: Optional[str]
    due_date: Optional[str]
    priority: str
    status: str

class TranscriptLineResponse(BaseModel):
    speaker: str
    text: str
    timestamp: str
    confidence: float

class MeetingStartRequest(BaseModel):
    title: str
    participants: Optional[List[str]] = None

class MeetingStartResponse(BaseModel):
    success: bool
    meeting_id: str
    status: str
    started_at: str

class ProcessAudioResponse(BaseModel):
    success: bool
    meeting_id: str
    transcript: List[TranscriptLineResponse]
    summary: str
    action_items: List[ActionItemResponse]
    participants: List[str]
    processing_time_ms: int

class MeetingListResponse(BaseModel):
    meetings: List[dict]
    total: int

class SendEmailRequest(BaseModel):
    recipient_email: Optional[str] = None

class SendEmailResponse(BaseModel):
    success: bool
    email_sent: bool
    message: str

def get_current_user(authorization: str = Header(...), db: Session = Depends(get_db)) -> User:
    """Extract and validate JWT token"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        )

    token = authorization.replace("Bearer ", "")
    user_id = verify_token(token)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user

@router.post("/start", response_model=MeetingStartResponse)
def start_meeting(
    request: MeetingStartRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Initialize a new meeting session"""
    try:
        logger.info(f"Starting meeting for user: {user.user_id}")

        meeting = Meeting(
            user_id=user.user_id,
            title=request.title,
            participants=request.participants or [],
            status="recording",
            started_at=datetime.utcnow()
        )
        db.add(meeting)
        db.commit()
        db.refresh(meeting)

        logger.info(f"Meeting created: {meeting.meeting_id}")

        return {
            "success": True,
            "meeting_id": meeting.meeting_id,
            "status": "recording",
            "started_at": meeting.started_at.isoformat()
        }

    except Exception as e:
        logger.error(f"Meeting start error: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start meeting"
        )

@router.post("/process-audio", response_model=ProcessAudioResponse)
async def process_audio(
    file: UploadFile = File(...),
    meeting_id: str = Form(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Process audio file and extract transcript, summary, and action items"""
    temp_audio_path = None
    temp_mp3_path = None

    try:
        logger.info(f"Processing audio for meeting: {meeting_id}")

        # Verify meeting exists and belongs to user
        meeting = db.query(Meeting).filter(
            Meeting.meeting_id == meeting_id,
            Meeting.user_id == user.user_id
        ).first()

        if not meeting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meeting not found"
            )

        # Save uploaded file temporarily
        import tempfile
        temp_dir = tempfile.gettempdir()
        temp_audio_path = os.path.join(temp_dir, f"audio_{meeting_id}")

        audio_content = await file.read()
        with open(temp_audio_path, "wb") as f:
            f.write(audio_content)

        logger.info(f"Audio file saved: {temp_audio_path}")

        # Convert to MP3 if needed
        processor = AudioProcessor()
        file_ext = file.filename.split(".")[-1].lower() if file.filename else "webm"
        if file_ext != "mp3":
            temp_mp3_path = await processor.convert_to_mp3(audio_content, file_ext)
        else:
            temp_mp3_path = temp_audio_path

        logger.info(f"Audio converted to MP3: {temp_mp3_path}")

        # Transcribe audio
        transcriber = WhisperTranscriber()
        transcript_data = await transcriber.transcribe_audio(temp_mp3_path)

        if not transcript_data.get("success"):
            raise Exception("Transcription failed")

        transcript_lines = transcript_data.get("lines", [])
        full_text = transcript_data.get("text", "")

        logger.info(f"Transcription complete: {len(transcript_lines)} lines")

        # Generate summary and extract action items
        llm = OllamaLLM()

        summary = await llm.generate_summary(full_text) if full_text else "No summary available"
        action_items_data = await llm.extract_action_items(full_text) if full_text else []

        logger.info(f"Summary generated, {len(action_items_data)} action items extracted")

        # Store transcript lines in database
        for idx, line in enumerate(transcript_lines):
            transcript = Transcript(
                meeting_id=meeting_id,
                speaker=line.get("speaker", "Unknown"),
                text=line.get("text", ""),
                timestamp_ms=line.get("timestamp_ms", 0),
                confidence=line.get("confidence", 0.95)
            )
            db.add(transcript)

        # Store action items in database
        for item in action_items_data:
            action = ActionItem(
                meeting_id=meeting_id,
                title=item.get("title", ""),
                description=item.get("description"),
                assigned_to=item.get("assigned_to"),
                due_date=item.get("due_date"),
                priority=item.get("priority", "medium")
            )
            db.add(action)

        # Update meeting record
        meeting.summary = summary
        meeting.duration_seconds = int(transcript_data.get("duration_ms", 0) / 1000)
        meeting.status = "completed"
        meeting.ended_at = datetime.utcnow()

        db.commit()
        db.refresh(meeting)

        logger.info(f"Meeting processing complete: {meeting.meeting_id}")

        # Prepare response - convert timestamp_ms (int) to timestamp (formatted string)
        transcript_response = [
            {
                "speaker": line.get("speaker", "Speaker"),
                "text": line.get("text", ""),
                "timestamp": f"{int(line.get('timestamp_ms', 0)) // 60000}:{(int(line.get('timestamp_ms', 0)) % 60000) // 1000:02d}",
                "confidence": line.get("confidence", 0.95)
            }
            for line in transcript_lines
        ]

        # Fetch stored action items to get their assigned IDs
        stored_actions = db.query(ActionItem).filter(
            ActionItem.meeting_id == meeting_id
        ).all()

        action_items_response = [
            {
                "action_id": a.action_id,
                "title": a.title,
                "description": a.description,
                "assigned_to": a.assigned_to,
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "priority": a.priority,
                "status": a.status
            }
            for a in stored_actions
        ]

        return {
            "success": True,
            "meeting_id": meeting.meeting_id,
            "transcript": transcript_response,
            "summary": summary,
            "action_items": action_items_response,
            "participants": meeting.participants or [],
            "processing_time_ms": 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audio processing error: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process audio: {str(e)}"
        )

    finally:
        # Cleanup temporary files
        if temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except:
                pass
        if temp_mp3_path and temp_mp3_path != temp_audio_path and os.path.exists(temp_mp3_path):
            try:
                os.remove(temp_mp3_path)
            except:
                pass

@router.post("/{meeting_id}/email", response_model=SendEmailResponse)
async def send_meeting_email(
    meeting_id: str,
    request: Optional[SendEmailRequest] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send meeting summary and action items via email"""
    try:
        logger.info(f"Sending email for meeting: {meeting_id}")

        # Verify meeting exists and belongs to user
        meeting = db.query(Meeting).filter(
            Meeting.meeting_id == meeting_id,
            Meeting.user_id == user.user_id
        ).first()

        if not meeting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meeting not found"
            )

        # Get transcript and action items
        transcripts = db.query(Transcript).filter(
            Transcript.meeting_id == meeting_id
        ).all()

        actions = db.query(ActionItem).filter(
            ActionItem.meeting_id == meeting_id
        ).all()

        # Convert action items to dict for email
        action_items_for_email = [
            {
                "title": a.title,
                "assigned_to": a.assigned_to,
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "priority": a.priority
            }
            for a in actions
        ]

        # Convert transcripts to dict for email
        transcript_for_email = [
            {
                "speaker": t.speaker,
                "text": t.text,
                "timestamp": f"{t.timestamp_ms // 60000}:{(t.timestamp_ms % 60000) // 1000:02d}",
                "confidence": t.confidence
            }
            for t in transcripts
        ]

        # Use provided email or user's email
        email_to = request.recipient_email if request else user.email
        if request and request.recipient_email:
            email_to = request.recipient_email
        else:
            email_to = user.email

        # Send email
        mailer = EmailNotifier()
        result = await mailer.send_meeting_summary(
            email=email_to,
            meeting_title=meeting.title or "Meeting",
            summary=meeting.summary or "No summary available",
            action_items=action_items_for_email,
            transcript=transcript_for_email
        )

        if result.get("success"):
            logger.info(f"Email sent successfully to {email_to}")
            return {
                "success": True,
                "email_sent": True,
                "message": f"Email sent to {email_to}"
            }
        else:
            logger.error(f"Email sending failed: {result.get('message')}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("message", "Failed to send email")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email endpoint error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send email: {str(e)}"
        )

@router.get("/", response_model=MeetingListResponse)
def list_meetings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all meetings for current user"""
    try:
        logger.info(f"Listing meetings for user: {user.user_id}")

        meetings = db.query(Meeting).filter(
            Meeting.user_id == user.user_id
        ).order_by(Meeting.created_at.desc()).all()

        meetings_list = [
            {
                "meeting_id": m.meeting_id,
                "title": m.title,
                "started_at": m.started_at.isoformat(),
                "duration_seconds": m.duration_seconds,
                "participants": m.participants or [],
                "action_items_count": len(m.action_items),
                "status": m.status
            }
            for m in meetings
        ]

        return {
            "meetings": meetings_list,
            "total": len(meetings_list)
        }

    except Exception as e:
        logger.error(f"Meetings list error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch meetings"
        )

@router.get("/{meeting_id}")
def get_meeting_detail(
    meeting_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed information for a specific meeting"""
    try:
        logger.info(f"Fetching meeting details: {meeting_id}")

        meeting = db.query(Meeting).filter(
            Meeting.meeting_id == meeting_id,
            Meeting.user_id == user.user_id
        ).first()

        if not meeting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meeting not found"
            )

        transcripts = db.query(Transcript).filter(
            Transcript.meeting_id == meeting_id
        ).all()

        actions = db.query(ActionItem).filter(
            ActionItem.meeting_id == meeting_id
        ).all()

        return {
            "success": True,
            "meeting_id": meeting.meeting_id,
            "title": meeting.title,
            "started_at": meeting.started_at.isoformat(),
            "duration_seconds": meeting.duration_seconds,
            "summary": meeting.summary,
            "transcript": [
                {
                    "speaker": t.speaker,
                    "text": t.text,
                    "timestamp": f"{t.timestamp_ms // 60000}:{(t.timestamp_ms % 60000) // 1000:02d}",
                    "confidence": t.confidence
                }
                for t in transcripts
            ],
            "action_items": [
                {
                    "action_id": a.action_id,
                    "title": a.title,
                    "assigned_to": a.assigned_to,
                    "due_date": a.due_date.isoformat() if a.due_date else None,
                    "priority": a.priority,
                    "status": a.status
                }
                for a in actions
            ],
            "participants": meeting.participants or []
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Meeting detail error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch meeting details"
        )
