from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import psycopg2
from psycopg2.extras import RealDictCursor
import uuid
import sys
import os
import re
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables from .env
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(root_dir, '.env')
load_dotenv(dotenv_path=env_path)
DATABASE_URL = os.getenv("DATABASE_URL")

# Add blog-agent to python path so we can import the agent
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(root_dir)
sys.path.append(os.path.join(root_dir, "blog-agent"))
from agent import run as run_agent

app = FastAPI(title="Blog Agent API")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("ALLOWED_ORIGINS", "*")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS blogs (
            id TEXT PRIMARY KEY,
            topic TEXT NOT NULL,
            as_of TEXT NOT NULL,
            status TEXT NOT NULL,
            content TEXT,
            created_at TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

class BlogRequest(BaseModel):
    topic: str
    as_of: Optional[str] = None

def run_agent_task(blog_id: str, topic: str, as_of: str):
    """Background task to run the agent and update the DB."""
    try:
        print(f"Starting agent task for blog {blog_id} (topic: {topic})")
        # Ensure we run in the main project directory so the .env and images/ work properly
        os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        
        # Run the agent
        out = run_agent(topic, as_of)
        final_md = out.get("final", "")
        
        # Update DB
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "UPDATE blogs SET status = %s, content = %s WHERE id = %s",
            ("completed", final_md, blog_id)
        )
        conn.commit()
        conn.close()
        print(f"Completed agent task for blog {blog_id}")
    except Exception as e:
        print(f"Error in agent task: {e}")
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "UPDATE blogs SET status = %s, content = %s WHERE id = %s",
            ("failed", str(e), blog_id)
        )
        conn.commit()
        conn.close()

@app.post("/api/blogs")
def create_blog(request: BlogRequest, background_tasks: BackgroundTasks):
    from datetime import date, timezone
    blog_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    actual_as_of = request.as_of or date.today().isoformat()
    
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO blogs (id, topic, as_of, status, content, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
        (blog_id, request.topic, actual_as_of, "generating", "", created_at)
    )
    conn.commit()
    conn.close()
    
    background_tasks.add_task(run_agent_task, blog_id, request.topic, actual_as_of)
    return {"id": blog_id, "status": "generating"}

@app.get("/api/blogs")
def list_blogs():
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT id, topic, as_of, status, created_at FROM blogs ORDER BY created_at DESC")
    rows = cur.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/api/blogs/{blog_id}")
def get_blog(blog_id: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM blogs WHERE id = %s", (blog_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Blog not found")
    return dict(row)

@app.get("/api/blogs/{blog_id}/download")
def download_blog(blog_id: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT topic, content, status FROM blogs WHERE id = %s", (blog_id,))
    row = cur.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Blog not found")
    if row["status"] != "completed":
        raise HTTPException(status_code=400, detail="Blog is not ready for download")
        
    safe_title = row["topic"].replace("/", "-").replace(":", "-").replace("\\", "-")
    
    return Response(
        content=row["content"],
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_title}.md"'
        }
    )

@app.delete("/api/blogs/{blog_id}")
def delete_blog(blog_id: str):
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT content FROM blogs WHERE id = %s", (blog_id,))
    row = cur.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Blog not found")
        
    content = row["content"] or ""
    
    cur = conn.cursor()
    cur.execute("DELETE FROM blogs WHERE id = %s", (blog_id,))
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    
    # Try to delete associated images from Supabase Storage only if images are present
    if deleted > 0 and content and "![" in content:
        try:
            supabase_url = os.environ.get("SUPABASE_URL", "")
            supabase_key = os.environ.get("SUPABASE_KEY", "")
            bucket_name = os.environ.get("SUPABASE_BUCKET", "blog-images")
            
            if supabase_url and supabase_key:
                supabase = create_client(supabase_url, supabase_key)
                
                # Extract the relative file paths from the markdown image URLs
                pattern = rf"{supabase_url}/storage/v1/object/public/{bucket_name}/([^\s\)]+)"
                matches = re.findall(pattern, content)
                
                if matches:
                    supabase.storage.from_(bucket_name).remove(matches)
                    print(f"Deleted {len(matches)} images from Supabase for blog {blog_id}")
        except Exception as e:
            print(f"Failed to delete images from Supabase: {e}")
            
    return {"status": "success", "message": "Blog deleted successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
