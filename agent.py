import os
import pandas as pd
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import TypedDict, Annotated
import operator

load_dotenv()

class AgentState(TypedDict):
    messages: Annotated[list, operator.add]

@tool
def load_jeesa_cutoffs(query: str) -> str:
    """Search JoSAA cutoff data for institutes, branches, years. Always use this for cutoff related questions."""
    try:
        df = pd.read_csv("jeesa_cutoffs.csv")
        # Basic search - you can improve this later
        results = df.to_string(index=False)
        return f"JoSAA Cutoff Data:\n{results}"
    except Exception as e:
        return f"CSV error: {str(e)}. Make sure jeesa_cutoffs.csv exists."

@tool
def percentile_to_rank(percentile: float) -> str:
    """Convert JEE Main percentile to approximate All India Rank."""
    if percentile >= 99.9:
        rank = int((100 - percentile) * 500)
    elif percentile >= 99:
        rank = int((100 - percentile) * 2500)
    elif percentile >= 97:
        rank = int((100 - percentile) * 12000)
    else:
        rank = int((100 - percentile) * 20000)
    return f"≈ Rank {rank:,} for {percentile}%ile (2024-25 approx)."

tools = [load_jeesa_cutoffs, percentile_to_rank]

system_prompt = """You are an expert JEE Admission Counselor.
Always use tools when needed.
Be accurate, honest about approximations, and recommend checking official JoSAA website.
Never hallucinate cutoffs."""

# Use Groq instead of Ollama
llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
    temperature=0.1,
    api_key=os.getenv("API_key")
)

llm_with_tools = llm.bind_tools(tools)

def agent_node(state: AgentState):
    messages = state["messages"].copy()
    if not any(isinstance(m, dict) and m.get("role") == "system" for m in messages):
        messages.insert(0, {"role": "system", "content": system_prompt})
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

def should_continue(state: AgentState):
    last = state["messages"][-1]
    if last.tool_calls:
        return "tools"
    return END

workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

app = workflow.compile()

if __name__ == "__main__":
    print("🚀 JEE Admission Agent Ready!")