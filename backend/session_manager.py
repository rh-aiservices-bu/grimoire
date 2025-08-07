"""
Session-based Git authentication management for Grimoire.
Replaces persistent database storage with in-memory session storage.
"""

import os
from typing import Dict, Optional
from datetime import datetime, timezone
from cryptography.fernet import Fernet
import secrets

class SessionManager:
    """Manages in-memory session storage for Git authentication"""
    
    def __init__(self):
        # Generate or use environment encryption key
        self.encryption_key = os.getenv('GIT_ENCRYPTION_KEY', Fernet.generate_key())
        if isinstance(self.encryption_key, str):
            self.encryption_key = self.encryption_key.encode()
        self.cipher = Fernet(self.encryption_key)
        
        # Session storage (no timeout - persists for backend lifetime)
        self._sessions: Dict[str, Dict] = {}
    
    def create_session(self, git_data: dict) -> str:
        """Create a new session with git authentication data"""
        session_id = secrets.token_urlsafe(32)
        
        # Encrypt the access token
        encrypted_token = self.cipher.encrypt(git_data['access_token'].encode()).decode()
        
        session_data = {
            'git_platform': git_data['platform'],
            'git_username': git_data['username'],
            'git_access_token': encrypted_token,
            'git_server_url': git_data.get('server_url'),
            'created_at': datetime.now(timezone.utc),
            'last_accessed': datetime.now(timezone.utc)
        }
        
        self._sessions[session_id] = session_data
        return session_id
    
    def get_session(self, session_id: str) -> Optional[dict]:
        """Get session data by session ID"""
        if not session_id or session_id not in self._sessions:
            return None
            
        session = self._sessions[session_id]
        
        # Update last accessed time
        session['last_accessed'] = datetime.now(timezone.utc)
        return session
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session"""
        if session_id in self._sessions:
            del self._sessions[session_id]
            return True
        return False
    
    def get_git_credentials(self, session_id: str) -> Optional[dict]:
        """Get decrypted git credentials from session"""
        session = self.get_session(session_id)
        if not session:
            return None
        
        try:
            # Decrypt the access token
            decrypted_token = self.cipher.decrypt(session['git_access_token'].encode()).decode()
            
            return {
                'platform': session['git_platform'],
                'username': session['git_username'],
                'access_token': decrypted_token,
                'server_url': session['git_server_url'],
                'created_at': session['created_at']
            }
        except Exception:
            # If decryption fails, remove the invalid session
            self.delete_session(session_id)
            return None
    
    def cleanup_expired_sessions(self):
        """Remove expired sessions - No-op since sessions don't expire"""
        pass
    
    def get_session_count(self) -> int:
        """Get the number of active sessions"""
        return len(self._sessions)
    
    def is_authenticated(self, session_id: str) -> bool:
        """Quick check if session is authenticated"""
        return self.get_session(session_id) is not None

# Global session manager instance
session_manager = SessionManager()