from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agent import app as agent_graph  # Import your LangGraph app

app = FastAPI(title="JEE Admission Agent API")

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Query(BaseModel):
    message: str

@app.get("/")
async def home():
    return {"message": "JEE Admission Agent Backend is running!"}

@app.post("/chat")
async def chat(query: Query):
    try:
        result = agent_graph.invoke({
            "messages": [{"role": "user", "content": query.message}]
        })
        return {"response": result["messages"][-1].content}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)