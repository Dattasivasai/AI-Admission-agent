from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import traceback

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

import traceback

@app.post("/chat")
async def chat(query: Query):
    try:
        input_data = {
            "messages": query.history
            + [{"role": "user", "content": query.message}]
        }

        result = await agent_graph.ainvoke(input_data)

        messages = result.get("messages", [])

        if not messages:
            return {"response": "No response was generated."}

        final_message = messages[-1]
        content = getattr(final_message, "content", str(final_message))

        return {"response": content}

    except Exception as e:
        print("CHAT ERROR:", repr(e))
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={"detail": str(e)},
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
