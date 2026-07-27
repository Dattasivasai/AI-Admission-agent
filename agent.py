import os
import pandas as pd
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
import operator

load_dotenv()

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]

# ====================== TOOLS ======================

@tool
def load_jeesa_cutoffs(query: str) -> str:
    """
    Search JoSAA cutoff data.
    Use this tool for ANY question about college cutoffs, ranks, institutes, branches, years, categories.
    Example queries: "IIIT Hyderabad CSE", "NIT Trichy 2024", "IIT Bombay Computer Science General"
    """
    try:
        df = pd.read_csv("jeesa_cutoffs.csv")

        # Simple keyword search (improve later)
        query_lower = query.lower()
        mask = df.apply(lambda row: row.astype(str).str.lower().str.contains(query_lower).any(), axis=1)
        filtered = df[mask]

        if filtered.empty:
            return f"No exact matches found for '{query}'. Try a broader search (e.g. just institute name)."

        # Limit rows so we don't blow context
        result = filtered.head(40).to_string(index=False)
        return f"Found {len(filtered)} matching rows (showing first 40):\n\n{result}"
    except Exception as e:
        return f"Error reading CSV: {str(e)}"


@tool
def percentile_to_rank(percentile: float) -> str:
    """Convert JEE Main percentile to approximate All India Rank (approximate only)."""
    if percentile >= 99.9:
        rank = int((100 - percentile) * 500)
    elif percentile >= 99:
        rank = int((100 - percentile) * 2500)
    elif percentile >= 97:
        rank = int((100 - percentile) * 12000)
    else:
        rank = int((100 - percentile) * 20000)
    return f"Approximate Rank ≈ {rank:,} for {percentile} percentile (rough estimate based on recent years)."


tools = [load_jeesa_cutoffs, percentile_to_rank]

# ====================== LLM ======================

# Better model for tool calling
llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),   # ← much better at tools
    temperature=0.1,
    api_key=os.getenv("GROQ_API_KEY") or os.getenv("API_key")
)

llm_with_tools = llm.bind_tools(tools)

SYSTEM_PROMPT = """You are an expert JEE Main + JoSAA Admission Counselor.

RULES:
1. For ANY question about cutoffs, colleges, branches, ranks, years, categories → ALWAYS call the tool `load_jeesa_cutoffs`.
2. For percentile → rank conversion → use `percentile_to_rank`.
3. Never invent cutoff numbers. Only use data from the tools.
4. Be honest that ranks are approximate.
5. After getting tool results, give a clear, helpful answer.
6. If data is missing, say so clearly.

Respond in a helpful and professional tone."""

def agent_node(state: AgentState):
    messages = list(state["messages"])

    # Always ensure system message is first
    if not messages or not isinstance(messages[0], SystemMessage):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + messages

    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def should_continue(state: AgentState):
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END


# ====================== GRAPH ======================

workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))
workflow.set_entry_point("agent")
workflow.add_conditional_edges("agent", should_continue)
workflow.add_edge("tools", "agent")

app = workflow.compile()

if __name__ == "__main__":
    print("🚀 JEE Admission Agent Ready (Groq + Tools)")
