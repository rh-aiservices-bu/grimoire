import json
import base64
import requests
from typing import Optional, Dict, Any, Tuple, List
from urllib.parse import urlparse
from cryptography.fernet import Fernet
import os
from schemas import ProdPromptData

class GitService:
    def __init__(self):
        # Use environment variable for encryption key, or generate one
        self.encryption_key = os.getenv('GIT_ENCRYPTION_KEY', Fernet.generate_key())
        if isinstance(self.encryption_key, str):
            self.encryption_key = self.encryption_key.encode()
        self.cipher = Fernet(self.encryption_key)
    
    def encrypt_token(self, token: str) -> str:
        """Encrypt git access token"""
        return self.cipher.encrypt(token.encode()).decode()
    
    def decrypt_token(self, encrypted_token: str) -> str:
        """Decrypt git access token"""
        return self.cipher.decrypt(encrypted_token.encode()).decode()
    
    def parse_git_url(self, repo_url: str) -> Tuple[str, str, str]:
        """Parse git repository URL to extract platform, owner, and repo name"""
        # Remove .git suffix if present
        if repo_url.endswith('.git'):
            repo_url = repo_url[:-4]
        
        # Parse URL
        parsed = urlparse(repo_url)
        
        # Determine platform
        platform = None
        if 'github.com' in parsed.netloc:
            platform = 'github'
        elif 'gitlab.com' in parsed.netloc:
            platform = 'gitlab'
        else:
            # Assume self-hosted GitLab or Gitea
            platform = 'gitlab'  # Default to GitLab API
        
        # Extract owner and repo from path
        path_parts = parsed.path.strip('/').split('/')
        if len(path_parts) >= 2:
            owner = path_parts[0]
            repo = path_parts[1]
        else:
            raise ValueError("Invalid repository URL format")
        
        return platform, owner, repo
    
    def get_api_base_url(self, platform: str, repo_url: str) -> str:
        """Get API base URL for the git platform"""
        parsed = urlparse(repo_url)
        
        if platform == 'github':
            if 'github.com' in parsed.netloc:
                return 'https://api.github.com'
            else:
                # GitHub Enterprise
                return f"{parsed.scheme}://{parsed.netloc}/api/v3"
        else:  # GitLab or Gitea
            return f"{parsed.scheme}://{parsed.netloc}/api/v1"
    
    def test_git_access(self, platform: str, username: str, token: str, repo_url: str) -> bool:
        """Test if git credentials have access to the repository"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, repo_url)
            
            headers = {
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json' if platform == 'github' else 'application/json'
            }
            
            if platform == 'github':
                url = f"{api_base}/repos/{owner}/{repo}"
            else:  # GitLab/Gitea
                url = f"{api_base}/repos/{owner}/{repo}"
            
            response = requests.get(url, headers=headers, timeout=10)
            return response.status_code == 200
        except Exception as e:
            print(f"Git access test failed: {e}")
            return False
    
    def create_initial_pr(self, platform: str, token: str, repo_url: str, project_name: str, provider_id: str) -> Optional[Dict[str, Any]]:
        """Create initial PR with project folder structure"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, repo_url)
            
            headers = {
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json' if platform == 'github' else 'application/json',
                'Content-Type': 'application/json'
            }
            
            # Create branch name
            branch_name = f"create-project-{project_name.lower().replace(' ', '-')}"
            
            # Get default branch
            if platform == 'github':
                repo_info_url = f"{api_base}/repos/{owner}/{repo}"
                repo_response = requests.get(repo_info_url, headers=headers)
                if repo_response.status_code != 200:
                    return None
                default_branch = repo_response.json()['default_branch']
                
                # Get default branch SHA
                ref_url = f"{api_base}/repos/{owner}/{repo}/git/refs/heads/{default_branch}"
                ref_response = requests.get(ref_url, headers=headers)
                if ref_response.status_code != 200:
                    return None
                base_sha = ref_response.json()['object']['sha']
                
                # Create new branch
                create_ref_url = f"{api_base}/repos/{owner}/{repo}/git/refs"
                ref_data = {
                    "ref": f"refs/heads/{branch_name}",
                    "sha": base_sha
                }
                ref_create_response = requests.post(create_ref_url, headers=headers, json=ref_data)
                if ref_create_response.status_code not in [200, 201]:
                    return None
                
                # Create .gitkeep file in the model folder
                file_path = f"{project_name}/{provider_id}/.gitkeep"
                file_content = "# This file ensures the directory structure is preserved in git"
                
                create_file_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                file_data = {
                    "message": f"✨ Initialize project structure for {project_name}",
                    "content": base64.b64encode(file_content.encode()).decode(),
                    "branch": branch_name
                }
                file_response = requests.put(create_file_url, headers=headers, json=file_data)
                if file_response.status_code not in [200, 201]:
                    return None
                
                # Create pull request
                pr_url = f"{api_base}/repos/{owner}/{repo}/pulls"
                pr_data = {
                    "title": f"✨ Initialize project: {project_name}",
                    "body": f"This PR creates the initial folder structure for the **{project_name}** project.\n\n**Folder structure:**\n```\n{project_name}/\n└── {provider_id}/\n    └── .gitkeep\n```\n\nAfter merging this PR, you can start tagging prompts as production to automatically create prompt files in this structure.",
                    "head": branch_name,
                    "base": default_branch
                }
                pr_response = requests.post(pr_url, headers=headers, json=pr_data)
                if pr_response.status_code not in [200, 201]:
                    return None
                
                pr_data = pr_response.json()
                return {
                    'pr_url': pr_data['html_url'],
                    'pr_number': pr_data['number']
                }
            
            else:
                # GitLab/Gitea implementation would go here
                # For now, return None to indicate unsupported
                return None
                
        except Exception as e:
            print(f"Failed to create initial PR: {e}")
            return None
    
    def create_prompt_pr(self, platform: str, token: str, repo_url: str, project_name: str, provider_id: str, prompt_data: ProdPromptData) -> Optional[Dict[str, Any]]:
        """Create PR with prompt file"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, repo_url)
            
            headers = {
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json' if platform == 'github' else 'application/json',
                'Content-Type': 'application/json'
            }
            
            if platform == 'github':
                # Create branch name  
                import time
                timestamp = str(int(time.time()))
                branch_name = f"update-prompt-{project_name.lower().replace(' ', '-')}-{timestamp}"
                
                # Get default branch
                repo_info_url = f"{api_base}/repos/{owner}/{repo}"
                repo_response = requests.get(repo_info_url, headers=headers)
                if repo_response.status_code != 200:
                    return None
                default_branch = repo_response.json()['default_branch']
                
                # Get default branch SHA
                ref_url = f"{api_base}/repos/{owner}/{repo}/git/refs/heads/{default_branch}"
                ref_response = requests.get(ref_url, headers=headers)
                if ref_response.status_code != 200:
                    return None
                base_sha = ref_response.json()['object']['sha']
                
                # Create new branch
                create_ref_url = f"{api_base}/repos/{owner}/{repo}/git/refs"
                ref_data = {
                    "ref": f"refs/heads/{branch_name}",
                    "sha": base_sha
                }
                ref_create_response = requests.post(create_ref_url, headers=headers, json=ref_data)
                if ref_create_response.status_code not in [200, 201]:
                    return None
                
                # Prepare prompt JSON content
                prompt_json = {
                    "user_prompt": prompt_data.user_prompt,
                    "system_prompt": prompt_data.system_prompt,
                    "temperature": prompt_data.temperature,
                    "max_len": prompt_data.max_len,
                    "top_p": prompt_data.top_p,
                    "top_k": prompt_data.top_k,
                    "variables": prompt_data.variables,
                    "created_at": prompt_data.created_at
                }
                
                file_content = json.dumps(prompt_json, indent=2)
                file_path = f"{project_name}/{provider_id}/prompt_prod.json"
                
                # Check if file exists
                existing_file_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                existing_response = requests.get(existing_file_url, headers=headers)
                
                file_data = {
                    "message": f"🚀 Update production prompt for {project_name}",
                    "content": base64.b64encode(file_content.encode()).decode(),
                    "branch": branch_name
                }
                
                if existing_response.status_code == 200:
                    # File exists, update it
                    file_data["sha"] = existing_response.json()["sha"]
                
                file_response = requests.put(existing_file_url, headers=headers, json=file_data)
                if file_response.status_code not in [200, 201]:
                    return None
                
                # Create pull request
                pr_url = f"{api_base}/repos/{owner}/{repo}/pulls"
                action = "Update" if existing_response.status_code == 200 else "Create"
                pr_data = {
                    "title": f"🚀 {action} production prompt for {project_name}",
                    "body": f"This PR {'updates' if existing_response.status_code == 200 else 'creates'} the production prompt for **{project_name}** with model **{provider_id}**.\n\n**Prompt Details:**\n- User Prompt: {prompt_data.user_prompt[:100]}{'...' if len(prompt_data.user_prompt) > 100 else ''}\n- System Prompt: {prompt_data.system_prompt[:100] + '...' if prompt_data.system_prompt and len(prompt_data.system_prompt) > 100 else prompt_data.system_prompt or 'None'}\n- Temperature: {prompt_data.temperature}\n- Max Length: {prompt_data.max_len}\n\n**File:** `{file_path}`",
                    "head": branch_name,
                    "base": default_branch
                }
                pr_response = requests.post(pr_url, headers=headers, json=pr_data)
                if pr_response.status_code not in [200, 201]:
                    return None
                
                pr_data = pr_response.json()
                return {
                    'pr_url': pr_data['html_url'],
                    'pr_number': pr_data['number']
                }
            
            else:
                # GitLab/Gitea implementation would go here
                return None
                
        except Exception as e:
            print(f"Failed to create prompt PR: {e}")
            return None
    
    def get_prod_prompt_from_git(self, platform: str, token: str, repo_url: str, project_name: str, provider_id: str) -> Optional[ProdPromptData]:
        """Get the current production prompt from git repository"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, repo_url)
            
            headers = {
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json' if platform == 'github' else 'application/json'
            }
            
            file_path = f"{project_name}/{provider_id}/prompt_prod.json"
            print(f"Looking for prod prompt at: {file_path}")
            
            if platform == 'github':
                file_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                print(f"Fetching from: {file_url}")
                response = requests.get(file_url, headers=headers)
                print(f"File fetch response: {response.status_code}")
                
                if response.status_code == 200:
                    file_data = response.json()
                    content = base64.b64decode(file_data['content']).decode()
                    print(f"File content: {content[:200]}...")
                    prompt_json = json.loads(content)
                    
                    # Ensure created_at is a string
                    if 'created_at' in prompt_json and prompt_json['created_at'] is None:
                        prompt_json['created_at'] = "2024-01-01T00:00:00"
                    
                    return ProdPromptData(**prompt_json)
                else:
                    print(f"File not found: {response.text}")
                    return None
            else:
                # GitLab/Gitea implementation would go here
                return None
                
        except Exception as e:
            print(f"Failed to get prod prompt from git: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def check_pr_status(self, platform: str, token: str, repo_url: str, pr_number: int) -> Optional[str]:
        """Check if a PR is merged, closed, or still open"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, repo_url)
            
            headers = {
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json' if platform == 'github' else 'application/json'
            }
            
            if platform == 'github':
                pr_url = f"{api_base}/repos/{owner}/{repo}/pulls/{pr_number}"
                print(f"Checking PR status at: {pr_url}")
                response = requests.get(pr_url, headers=headers)
                print(f"PR status response: {response.status_code}")
                
                if response.status_code == 200:
                    pr_data = response.json()
                    print(f"PR data: merged={pr_data.get('merged')}, state={pr_data.get('state')}")
                    if pr_data.get('merged'):
                        return 'merged'
                    elif pr_data.get('state') == 'closed':
                        return 'closed'
                    else:
                        return 'open'
                else:
                    print(f"Failed to get PR info: {response.text}")
                    return None
            else:
                # GitLab/Gitea implementation would go here
                return None
                
        except Exception as e:
            print(f"Failed to check PR status: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def get_file_commit_history(self, platform: str, token: str, repo_url: str, file_path: str, limit: int = 10) -> List[Dict]:
        """Get commit history for a specific file"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, repo_url)
            
            headers = {
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json' if platform == 'github' else 'application/json'
            }
            
            if platform == 'github':
                commits_url = f"{api_base}/repos/{owner}/{repo}/commits"
                params = {
                    'path': file_path,
                    'per_page': limit
                }
                response = requests.get(commits_url, headers=headers, params=params)
                
                if response.status_code == 200:
                    commits = response.json()
                    return [
                        {
                            'sha': commit['sha'],
                            'message': commit['commit']['message'],
                            'date': commit['commit']['author']['date'],
                            'author': commit['commit']['author']['name'],
                            'url': commit['html_url']
                        }
                        for commit in commits
                    ]
                else:
                    print(f"Failed to get commit history: {response.text}")
                    return []
            else:
                # GitLab/Gitea implementation would go here
                return []
                
        except Exception as e:
            print(f"Failed to get file commit history: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_file_content_at_commit(self, platform: str, token: str, repo_url: str, file_path: str, commit_sha: str) -> Optional[ProdPromptData]:
        """Get file content at a specific commit"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, repo_url)
            
            headers = {
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json' if platform == 'github' else 'application/json'
            }
            
            if platform == 'github':
                file_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                params = {'ref': commit_sha}
                response = requests.get(file_url, headers=headers, params=params)
                
                if response.status_code == 200:
                    file_data = response.json()
                    content = base64.b64decode(file_data['content']).decode()
                    prompt_json = json.loads(content)
                    
                    # Ensure created_at is a string
                    if 'created_at' in prompt_json and prompt_json['created_at'] is None:
                        prompt_json['created_at'] = "2024-01-01T00:00:00"
                    
                    return ProdPromptData(**prompt_json)
                else:
                    return None
            else:
                # GitLab/Gitea implementation would go here
                return None
                
        except Exception as e:
            print(f"Failed to get file content at commit: {e}")
            return None