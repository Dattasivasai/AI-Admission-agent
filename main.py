import logging
import sys
import json
import re

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from langchain_core.messages import HumanMessage, AIMessage

from agent import app as agent_graph, get_college_overview

# ====================== LOGGING ======================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("admission_agent")

# ====================== APP ======================

app = FastAPI(title="JEE Admission Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ====================== GLOBAL ERROR HANDLERS ======================


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "validation_error path=%s errors=%s", request.url.path, exc.errors()
    )
    return JSONResponse(
        status_code=422,
        content={"error": "Invalid request", "detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    logger.exception("unhandled_error path=%s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


# ====================== MODELS ======================


class HistoryMessage(BaseModel):
    role: str
    content: str


class Query(BaseModel):
    message: str
    history: Optional[List[HistoryMessage]] = []


# Keep requests below the LLM provider's TPM limit. The browser holds the full
# transcript; the agent needs only recent conversational context.
MAX_HISTORY_MESSAGES = 8
MAX_HISTORY_CONTENT_CHARS = 400


def general_college_query(message: str) -> Optional[str]:
    """Return the college name for a general-information request, if any."""
    text = (message or "").strip()
    lowered = text.lower()
    if any(word in lowered for word in ("cutoff", "rank", "opening", "closing", "quota", "category", "seat")):
        return None

    match = re.search(
        r"(?:tell\s+me\s+(?:something\s+)?about|information\s+(?:about|on)|about)\s+(.+?)[?.!]*$",
        text,
        flags=re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


# ====================== ROUTES ======================


@app.get("/")
async def home():
    return {"message": "JEE Admission Agent Backend is running!"}


@app.post("/chat")
async def chat(query: Query):
    college_name = general_college_query(query.message)
    overview = get_college_overview(college_name) if college_name else None

    if overview:
        async def overview_generator():
            yield f"data: {json.dumps({'type': 'token', 'content': overview})}\n\n"
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(overview_generator(), media_type="text/event-stream")

    messages = []

    for msg in (query.history or [])[-MAX_HISTORY_MESSAGES:]:
        content = (msg.content or "")[-MAX_HISTORY_CONTENT_CHARS:]
        if msg.role == "user":
            messages.append(HumanMessage(content=content))
        elif msg.role == "agent":
            messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=query.message))

    async def event_generator():
        try:
            logger.info("chat_start message_len=%s", len(query.message or ""))

            async for event in agent_graph.astream_events(
                {"messages": messages}, version="v2"
            ):
                kind = event["event"]

                # Stream tokens from the LLM
                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    content = chunk.content
                    if content:
                        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

                elif kind == "on_tool_start":
                    tool_name = event.get("name", "unknown_tool")
                    logger.info("tool_start name=%s", tool_name)
                    yield f"data: {json.dumps({'type': 'status', 'content': f'Searching JoSAA cutoffs...'})}\n\n"

                elif kind == "on_tool_end":
                    tool_name = event.get("name", "unknown_tool")
                    tool_output = str(event.get("data", {}).get("output", ""))[:200]
                    logger.info(
                        "tool_end name=%s output_preview=%s", tool_name, tool_output
                    )
                    yield f"data: {json.dumps({'type': 'status', 'content': 'Writing answer...'})}\n\n"

                elif kind == "on_chat_model_end":
                    yield f"data: {json.dumps({'type': 'end'})}\n\n"

            # Always send done so the frontend knows the stream is over
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            logger.info("chat_done")

        except Exception as e:
            logger.exception("chat_stream_error")
            err = str(e)[:300]
            yield f"data: {json.dumps({'type': 'error', 'content': f'Sorry, something went wrong: {err}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
