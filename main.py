from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from langchain_core.messages import HumanMessage, AIMessage
import json

from agent import app as agent_graph

app = FastAPI(title="JEE Admission Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class HistoryMessage(BaseModel):
    role: str
    content: str

class Query(BaseModel):
    message: str
    history: Optional[List[HistoryMessage]] = []

@app.get("/")
async def home():
    return {"message": "JEE Admission Agent Backend is running!"}

@app.post("/chat")
async def chat(query: Query):
    try:
        messages = []

        for msg in query.history or []:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "agent":
                messages.append(AIMessage(content=msg.content))

        messages.append(HumanMessage(content=query.message))

        async def event_generator():
            try:
                # Stream events from LangGraph
                async for event in agent_graph.astream_events(
                    {"messages": messages},
                    version="v2"
                ):
                    kind = event["event"]

                    # Stream tokens from the LLM
                    if kind == "on_chat_model_stream":
                        chunk = event["data"]["chunk"]
                        content = chunk.content
                        if content:
                            yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

                    elif kind == "on_tool_start":
                        yield f"data: {json.dumps({'type': 'status', 'content': 'Searching JoSAA cutoffs...'})}\n\n"

                    elif kind == "on_tool_end":
                        yield f"data: {json.dumps({'type': 'status', 'content': 'Writing answer...'})}\n\n"

                    # When the agent finishes
                    elif kind == "on_chat_model_end":
                        yield f"data: {json.dumps({'type': 'end'})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )

    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})
