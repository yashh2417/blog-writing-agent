import { useState, useEffect } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { PenTool, Download, FileText, LayoutTemplate, Clock, AlertTriangle, Search, Copy, Check, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/blogs';

interface Blog {
  id: string;
  topic: string;
  as_of: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  created_at: string;
  content?: string;
}

const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div style={{ position: 'relative', margin: '1rem 0' }}>
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            color: '#fff',
            padding: '4px 8px',
            fontSize: '0.75rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            zIndex: 10,
            backdropFilter: 'blur(4px)',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <SyntaxHighlighter
          {...props}
          style={dracula as any}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, borderRadius: '8px' }}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code {...props} className={`inline-code ${className || ''}`}>
      {children}
    </code>
  );
};

function App() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [topic, setTopic] = useState('');
  const [asOfDate, setAsOfDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedBlogId, setSelectedBlogId] = useState<string | null>(null);
  const [activeBlog, setActiveBlog] = useState<Blog | null>(null);
  
  // Polling for generating status
  useEffect(() => {
    fetchBlogs();
    const interval = setInterval(() => {
      fetchBlogs(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  
  const fetchBlogs = async (silent = false) => {
    try {
      const res = await axios.get(API_URL);
      setBlogs(res.data);
    } catch (error) {
      console.error("Failed to fetch blogs", error);
    }
  };

  // Watch for status changes to update the active blog
  useEffect(() => {
    if (selectedBlogId) {
      const updatedBlog = blogs.find(b => b.id === selectedBlogId);
      if (updatedBlog && activeBlog && updatedBlog.status !== activeBlog.status) {
        fetchBlogDetails(selectedBlogId);
      }
    }
  }, [blogs, selectedBlogId, activeBlog]);
  
  const fetchBlogDetails = async (id: string) => {
    try {
      const res = await axios.get(`${API_URL}/${id}`);
      setActiveBlog(res.data);
    } catch (error) {
      console.error("Failed to fetch blog details", error);
    }
  };
  
  const handleSelectBlog = (id: string) => {
    setSelectedBlogId(id);
    const blog = blogs.find(b => b.id === id);
    if (blog && blog.status === 'completed') {
      fetchBlogDetails(id);
    } else {
      setActiveBlog(blog || null);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;
    
    setLoading(true);
    try {
      const formattedDate = format(asOfDate || new Date(), 'yyyy-MM-dd');
      const res = await axios.post(API_URL, {
        topic,
        as_of: formattedDate
      });
      setTopic('');
      await fetchBlogs();
      handleSelectBlog(res.data.id);
    } catch (error) {
      console.error("Error generating blog:", error);
      alert("Failed to start blog generation");
    } finally {
      setLoading(false);
    }
  };
  
  const handleDownload = () => {
    if (!selectedBlogId) return;
    window.open(`${API_URL}/${selectedBlogId}/download`, '_blank');
  };
  
  const handleDelete = async () => {
    if (!selectedBlogId) return;
    if (!window.confirm("Are you sure you want to delete this blog?")) return;
    
    try {
      await axios.delete(`${API_URL}/${selectedBlogId}`);
      setSelectedBlogId(null);
      setActiveBlog(null);
      await fetchBlogs();
    } catch (error) {
      console.error("Failed to delete blog", error);
      alert("Failed to delete blog");
    }
  };
  
  return (
    <div className="app-container">
      {/* Sidebar for forms and history */}
      <div className="sidebar">
        
        {/* Create Blog Card */}
        <div className="glass-card">
          <h2 className="gradient-text"><PenTool style={{marginRight: 8}}/> Blog AI Agent</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Generate fully-researched technical deep dives in seconds.
          </p>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Topic or Title</label>
              <input 
                type="text" 
                placeholder="e.g. LLM Evaluation in 2026"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
              />
            </div>
            
            <div className="form-group">
              <label>As-Of Date (Knowledge Cutoff)</label>
              <DatePicker 
                selected={asOfDate} 
                onChange={(date) => setAsOfDate(date)} 
                dateFormat="yyyy-MM-dd"
                maxDate={new Date()}
                placeholderText="Optional: Defaults to today"
                isClearable
              />
            </div>
            
            <button type="submit" className="btn" disabled={loading || !topic}>
              {loading ? <span className="loader"></span> : 'Generate Report'}
            </button>
          </form>
        </div>
        
        {/* History List */}
        <div className="glass-card" style={{ flex: 1, overflowY: 'auto' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} /> Generated Blogs
          </h3>
          
          <div className="blog-list">
            {blogs.length === 0 ? (
              <p style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>No blogs generated yet.</p>
            ) : (
              blogs.map(blog => (
                <div 
                  key={blog.id} 
                  className={`blog-item ${selectedBlogId === blog.id ? 'active' : ''}`}
                  onClick={() => handleSelectBlog(blog.id)}
                >
                  <div className="blog-title">{blog.topic}</div>
                  <div className="blog-meta">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {format(new Date(blog.created_at), 'MMM d, HH:mm')}
                    </span>
                    <span className={`status-badge status-${blog.status}`}>
                      {blog.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
      </div>
      
      {/* Main Content Area */}
      <div className="glass-card main-content">
        {!activeBlog ? (
          <div className="empty-state">
            <LayoutTemplate />
            <h2>No Blog Selected</h2>
            <p>Select a blog from the sidebar or generate a new one.</p>
          </div>
        ) : activeBlog.status === 'generating' ? (
          <div className="empty-state">
            <div className="loader" style={{width: 40, height: 40, borderWidth: 4, marginBottom: 16, borderColor: 'var(--primary-color)', borderTopColor: 'transparent'}}></div>
            <h2>Researching & Writing...</h2>
            <p>The agent is currently writing the article and generating images. This takes ~60 seconds.</p>
          </div>
        ) : activeBlog.status === 'failed' ? (
          <div className="empty-state">
            <AlertTriangle color="#ef4444" />
            <h2>Generation Failed</h2>
            <p style={{color: '#ef4444', maxWidth: 400}}>{activeBlog.content}</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <span className="status-badge status-completed" style={{marginBottom: 8, display: 'inline-block'}}>Completed</span>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Knowledge Date: {activeBlog.as_of}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" style={{width: 'auto'}} onClick={handleDownload}>
                  <Download size={18} /> Download Markdown
                </button>
                <button className="btn" style={{width: 'auto', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)'}} onClick={handleDelete}>
                  <Trash2 size={18} /> Delete
                </button>
              </div>
            </div>
            
            <div className="markdown-container">
              {activeBlog.content ? (
                <ReactMarkdown
                  components={{
                    code: CodeBlock
                  }}
                >
                  {activeBlog.content}
                </ReactMarkdown>
              ) : (
                <p>No content available.</p>
              )}
            </div>
          </>
        )}
      </div>
      
    </div>
  );
}

export default App;
