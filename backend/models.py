from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

Base = declarative_base()

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    llamastack_url = Column(String, nullable=False)
    provider_id = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationship to prompt history
    prompt_history = relationship("PromptHistory", back_populates="project")

class PromptHistory(Base):
    __tablename__ = "prompt_history"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_prompt = Column(Text, nullable=False)
    system_prompt = Column(Text, nullable=True)
    variables = Column(Text, nullable=True)  # JSON string
    temperature = Column(Float, nullable=True)
    max_len = Column(Integer, nullable=True)
    top_p = Column(Float, nullable=True)
    top_k = Column(Integer, nullable=True)
    response = Column(Text, nullable=True)
    rating = Column(String, nullable=True)  # 'thumbs_up', 'thumbs_down', or null
    notes = Column(Text, nullable=True)
    is_prod = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationship to project
    project = relationship("Project", back_populates="prompt_history")