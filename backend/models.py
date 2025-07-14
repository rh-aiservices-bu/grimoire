from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    git_platform = Column(String, nullable=False)  # github, gitlab, gitea
    git_username = Column(String, nullable=False)
    git_access_token = Column(String, nullable=False)  # encrypted token
    git_server_url = Column(String, nullable=True)  # For self-hosted GitLab/Gitea
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class PendingPR(Base):
    __tablename__ = "pending_prs"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    prompt_history_id = Column(Integer, ForeignKey("prompt_history.id"), nullable=False)
    pr_url = Column(String, nullable=False)
    pr_number = Column(Integer, nullable=False)
    is_merged = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    project = relationship("Project", backref="pending_prs")
    prompt_history = relationship("PromptHistory", backref="pending_pr")

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    llamastack_url = Column(String, nullable=False)
    provider_id = Column(String, nullable=False)
    git_repo_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationship to prompt history
    prompt_history = relationship("PromptHistory", back_populates="project")

class GitCommitCache(Base):
    __tablename__ = "git_commit_cache"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    commit_sha = Column(String, nullable=False, index=True)
    commit_message = Column(Text, nullable=False)
    commit_date = Column(DateTime, nullable=False)
    author = Column(String, nullable=False)
    prompt_data = Column(Text, nullable=True)  # JSON string of the prompt content
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationship to project
    project = relationship("Project", backref="git_commits")

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