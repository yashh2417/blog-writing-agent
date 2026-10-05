from langgraph.graph import StateGraph, END, START
from tools import fanout

from schemas import State
from nodes import router_node, research_node, orchestrator_node, worker_node, route_next, generate_and_place_images, merge_content, decide_images
from datetime import date
from typing import Optional

from dotenv import load_dotenv

load_dotenv()



# 1. Create Reducer Subgraph

def build_reducer_subgraph():
    reducer_graph = StateGraph(State)
    reducer_graph.add_node("merge_content", merge_content)
    reducer_graph.add_node("decide_images", decide_images)
    reducer_graph.add_node("generate_and_place_images", generate_and_place_images)


    reducer_graph.add_edge(START, "merge_content")
    reducer_graph.add_edge("merge_content", "decide_images")
    reducer_graph.add_edge("decide_images", "generate_and_place_images")
    reducer_graph.add_edge("generate_and_place_images", END)
    reducer_subgraph = reducer_graph.compile()

    return reducer_subgraph


# 2. Main Agent Graph

def build_agent_graph():

    reducer_subgraph = build_reducer_subgraph()

    g = StateGraph(State)
    g.add_node("router", router_node)
    g.add_node("research", research_node)
    g.add_node("orchestrator", orchestrator_node)
    g.add_node("worker", worker_node)
    g.add_node("reducer", reducer_subgraph)

    g.add_edge(START, "router")
    g.add_conditional_edges("router", route_next, {"research": "research", "orchestrator": "orchestrator"})
    g.add_edge("research", "orchestrator")

    g.add_conditional_edges("orchestrator", fanout, ["worker"])
    g.add_edge("worker", "reducer")
    g.add_edge("reducer", END)

    agent = g.compile()
    return agent


# 3. Entry Point

def run(topic: str, as_of: Optional[str] = None):

    agent = build_agent_graph()
    
    if as_of is None:
        as_of = date.today().isoformat()

    out = agent.invoke(
        {
            "topic": topic,
            "mode": "",
            "needs_research": False,
            "queries": [],
            "evidence": [],
            "plan": None,
            "as_of": as_of,
            "recency_days": 7,   # router may overwrite
            "sections": [],
            "merged_md": "",
            "md_with_placeholders": "",
            "image_specs": [],
            "final": "",
        }
    )

    # plan: Plan = out["plan"]
    # print("\n" + "=" * 100)
    # print("TOPIC:", topic)
    # print("AS_OF:", out.get("as_of"), "RECENCY_DAYS:", out.get("recency_days"))
    # print("MODE:", out.get("mode"))
    # print("BLOG_KIND:", plan.blog_kind)
    # print("NEEDS_RESEARCH:", out.get("needs_research"))
    # print("QUERIES:", (out.get("queries") or [])[:6])

    # print("EVIDENCE_COUNT:", len(out.get("evidence", [])))
    # if out.get("evidence"):
    #     print("EVIDENCE_SAMPLE:", [e.model_dump() for e in out["evidence"][:2]])
    # print("TASKS:", len(plan.tasks))
    # print("SAVED_MD_CHARS:", len(out.get("final", "")))
    # print("=" * 100 + "\n")

    return out


if __name__ == "__main__":

    run("LLM Evaluation", "2026-10-04")
    
    
    

