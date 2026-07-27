from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import os

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

        # Convert frontend history → LangChain messages
        for msg in query.history or []:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "agent":
                messages.append(AIMessage(content=msg.content))

        # Add the new user message
        messages.append(HumanMessage(content=query.message))

        # Run the agent
        result = await agent_graph.ainvoke({
            "messages": messages
        })

        final_message = result["messages"][-1]
        response_text = final_message.content

        return {"response": response_text}

    except Exception as e:
        print("CHAT ERROR:", str(e))
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
