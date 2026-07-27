from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import os

from agent import app as agent_graph

app = FastAPI(title="JEE Admission Agent API")

# Allow all origins for now (you can restrict later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        # Convert to proper LangChain messages
        result = await agent_graph.ainvoke({
            "messages": [HumanMessage(content=query.message)]
        })

        # Get the final AI response
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
