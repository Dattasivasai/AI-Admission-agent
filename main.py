from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json

# Import the agent from agent.py
from agent import app as agent_graph

app = FastAPI(title="JEE Admission Agent API")

# CORS - Allows both local and deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # We'll restrict this later for security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Query(BaseModel):
    message: str
    history: list = []   # For conversation history

@app.get("/")
async def home():
    return {"message": "JEE Admission Agent Backend is running!"}

@app.post("/chat")
async def chat(query: Query):
    try:
        input_data = {
            "messages": query.history + [{"role": "user", "content": query.message}]
        }

        async def stream_response():
            try:
                async for chunk in agent_graph.astream(input_data):
                    if "messages" in chunk and chunk["messages"]:
                        content = chunk["messages"][-1].content
                        if content:
                            yield f"data: {json.dumps({'content': content})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(stream_response(), media_type="text/event-stream")

    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)