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
    
    def get_api_base_url(self, platform: str, server_url: Optional[str] = None, repo_url: Optional[str] = None) -> str:
        """Get API base URL for the git platform"""
        if platform == 'github':
            if server_url:
                parsed = urlparse(server_url)
                return f"{parsed.scheme}://{parsed.netloc}/api/v3"
            elif repo_url and 'github.com' not in repo_url:
                # GitHub Enterprise from repo URL
                parsed = urlparse(repo_url)
                return f"{parsed.scheme}://{parsed.netloc}/api/v3"
            else:
                return 'https://api.github.com'
        elif platform == 'gitlab':
            if server_url:
                parsed = urlparse(server_url)
                return f"{parsed.scheme}://{parsed.netloc}/api/v4"
            elif repo_url:
                parsed = urlparse(repo_url)
                return f"{parsed.scheme}://{parsed.netloc}/api/v4"
            else:
                return 'https://gitlab.com/api/v4'
        elif platform == 'gitea':
            if server_url:
                parsed = urlparse(server_url)
                return f"{parsed.scheme}://{parsed.netloc}/api/v1"
            elif repo_url:
                parsed = urlparse(repo_url)
                return f"{parsed.scheme}://{parsed.netloc}/api/v1"
            else:
                raise ValueError("Gitea requires server_url")
        else:
            raise ValueError(f"Unsupported platform: {platform}")
    
    def get_auth_headers(self, platform: str, token: str) -> Dict[str, str]:
        """Get authentication headers for the git platform"""
        if platform == 'github':
            return {
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json'
            }
        elif platform == 'gitlab':
            return {
                'Private-Token': token,
                'Accept': 'application/json'
            }
        elif platform == 'gitea':
            return {
                'Authorization': f'token {token}',
                'Accept': 'application/json'
            }
        else:
            raise ValueError(f"Unsupported platform: {platform}")
    
    def test_git_access(self, platform: str, username: str, token: str, repo_url: str, server_url: Optional[str] = None) -> bool:
        """Test if git credentials have access to the repository"""
        try:
            api_base = self.get_api_base_url(platform, server_url, repo_url)
            headers = self.get_auth_headers(platform, token)
            
            if platform == 'github':
                _, owner, repo = self.parse_git_url(repo_url)
                url = f"{api_base}/repos/{owner}/{repo}"
            elif platform == 'gitlab':
                # For GitLab, test authentication by checking user info instead of a specific repo
                # since we don't know what repos the user has access to
                url = f"{api_base}/user"
                print(f"Testing GitLab authentication with user endpoint: {url}")
            elif platform == 'gitea':
                # For Gitea, test authentication by checking user info instead of a specific repo
                # since we don't know what public repos exist on the instance
                url = f"{api_base}/user"
                print(f"Testing Gitea authentication with user endpoint: {url}")
            
            response = requests.get(url, headers=headers, timeout=10)
            print(f"Authentication test response: {response.status_code}")
            
            if platform == 'gitlab':
                # For GitLab user endpoint, check if we get user info and username matches
                if response.status_code == 200:
                    try:
                        user_data = response.json()
                        returned_username = user_data.get('username')
                        print(f"GitLab user info: {user_data}")
                        # Verify the username matches (case-insensitive)
                        if returned_username and returned_username.lower() == username.lower():
                            return True
                        else:
                            print(f"Username mismatch: expected '{username}', got '{returned_username}'")
                            return False
                    except Exception as e:
                        print(f"Failed to parse GitLab user response: {e}")
                        return False
                else:
                    print(f"GitLab authentication failed with status: {response.status_code}")
                    if response.status_code == 401:
                        print("Invalid token or insufficient permissions")
                    return False
            elif platform == 'gitea':
                # For Gitea user endpoint, check if we get user info and username matches
                if response.status_code == 200:
                    try:
                        user_data = response.json()
                        returned_username = user_data.get('login') or user_data.get('username')
                        print(f"Gitea user info: {user_data}")
                        # Verify the username matches (case-insensitive)
                        if returned_username and returned_username.lower() == username.lower():
                            return True
                        else:
                            print(f"Username mismatch: expected '{username}', got '{returned_username}'")
                            return False
                    except Exception as e:
                        print(f"Failed to parse Gitea user response: {e}")
                        return False
                else:
                    print(f"Gitea authentication failed with status: {response.status_code}")
                    if response.status_code == 401:
                        print("Invalid token or insufficient permissions")
                    return False
            else:
                # For GitHub, check if we can access the public test repo
                return response.status_code == 200
                
        except Exception as e:
            print(f"Git access test failed: {e}")
            import traceback
            traceback.print_exc()
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
            
            elif platform == 'gitlab':
                # GitLab implementation
                project_path = f"{owner}%2F{repo}"  # URL-encoded project path
                
                # Get default branch
                project_url = f"{api_base}/projects/{project_path}"
                project_response = requests.get(project_url, headers=headers)
                if project_response.status_code != 200:
                    print(f"Failed to get GitLab project info: {project_response.text}")
                    return None
                default_branch = project_response.json()['default_branch']
                
                # Create new branch
                branch_data = {
                    "branch": branch_name,
                    "ref": default_branch
                }
                branch_url = f"{api_base}/projects/{project_path}/repository/branches"
                branch_response = requests.post(branch_url, headers=headers, json=branch_data)
                if branch_response.status_code not in [200, 201]:
                    print(f"Failed to create GitLab branch: {branch_response.text}")
                    return None
                
                # Create .gitkeep file in the model folder
                file_path = f"{project_name}/{provider_id}/.gitkeep"
                file_content = "# This file ensures the directory structure is preserved in git"
                
                file_data = {
                    "branch": branch_name,
                    "commit_message": f"✨ Initialize project structure for {project_name}",
                    "content": base64.b64encode(file_content.encode()).decode()
                }
                
                file_url = f"{api_base}/projects/{project_path}/repository/files/{file_path.replace('/', '%2F')}"
                file_response = requests.post(file_url, headers=headers, json=file_data)
                if file_response.status_code not in [200, 201]:
                    print(f"Failed to create GitLab file: {file_response.text}")
                    return None
                
                # Create merge request (GitLab's equivalent of PR)
                mr_data = {
                    "source_branch": branch_name,
                    "target_branch": default_branch,
                    "title": f"✨ Initialize project: {project_name}",
                    "description": f"This MR creates the initial folder structure for the **{project_name}** project.\n\n**Folder structure:**\n```\n{project_name}/\n└── {provider_id}/\n    └── .gitkeep\n```\n\nAfter merging this MR, you can start tagging prompts as production to automatically create prompt files in this structure."
                }
                mr_url = f"{api_base}/projects/{project_path}/merge_requests"
                mr_response = requests.post(mr_url, headers=headers, json=mr_data)
                if mr_response.status_code not in [200, 201]:
                    print(f"Failed to create GitLab MR: {mr_response.text}")
                    return None
                
                mr_data = mr_response.json()
                return {
                    'pr_url': mr_data['web_url'],
                    'pr_number': mr_data['iid']  # GitLab uses 'iid' (internal ID)
                }
            
            elif platform == 'gitea':
                # Gitea implementation
                # Get default branch
                repo_info_url = f"{api_base}/repos/{owner}/{repo}"
                repo_response = requests.get(repo_info_url, headers=headers)
                if repo_response.status_code != 200:
                    print(f"Failed to get Gitea repo info: {repo_response.text}")
                    return None
                default_branch = repo_response.json()['default_branch']
                
                # Create new branch
                branch_data = {
                    "new_branch_name": branch_name,
                    "old_branch_name": default_branch
                }
                branch_url = f"{api_base}/repos/{owner}/{repo}/branches"
                branch_response = requests.post(branch_url, headers=headers, json=branch_data)
                if branch_response.status_code not in [200, 201]:
                    error_msg = branch_response.text
                    print(f"Failed to create Gitea branch: {error_msg}")
                    # Check for empty repository error
                    if "Git Repository is empty" in error_msg:
                        raise Exception("EMPTY_REPOSITORY: The git repository is empty. Please create an initial commit (e.g., add a README.md file) before creating pull requests.")
                    return None
                
                # Create .gitkeep file in the model folder
                file_path = f"{project_name}/{provider_id}/.gitkeep"
                file_content = "# This file ensures the directory structure is preserved in git"
                
                file_data = {
                    "branch": branch_name,
                    "message": f"✨ Initialize project structure for {project_name}",
                    "content": base64.b64encode(file_content.encode()).decode()
                }
                
                file_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                file_response = requests.post(file_url, headers=headers, json=file_data)
                if file_response.status_code not in [200, 201]:
                    print(f"Failed to create Gitea file: {file_response.text}")
                    return None
                
                # Create pull request
                pr_data = {
                    "head": branch_name,
                    "base": default_branch,
                    "title": f"✨ Initialize project: {project_name}",
                    "body": f"This PR creates the initial folder structure for the **{project_name}** project.\n\n**Folder structure:**\n```\n{project_name}/\n└── {provider_id}/\n    └── .gitkeep\n```\n\nAfter merging this PR, you can start tagging prompts as production to automatically create prompt files in this structure."
                }
                pr_url = f"{api_base}/repos/{owner}/{repo}/pulls"
                pr_response = requests.post(pr_url, headers=headers, json=pr_data)
                if pr_response.status_code not in [200, 201]:
                    print(f"Failed to create Gitea PR: {pr_response.text}")
                    return None
                
                pr_data = pr_response.json()
                return {
                    'pr_url': pr_data['html_url'],
                    'pr_number': pr_data['number']
                }
            
            else:
                print(f"Unsupported platform for PR creation: {platform}")
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
            
            elif platform == 'gitlab':
                # GitLab implementation for prompt PR
                project_path = f"{owner}%2F{repo}"  # URL-encoded project path
                
                # Create branch name  
                import time
                timestamp = str(int(time.time()))
                branch_name = f"update-prompt-{project_name.lower().replace(' ', '-')}-{timestamp}"
                
                # Get default branch
                project_url = f"{api_base}/projects/{project_path}"
                project_response = requests.get(project_url, headers=headers)
                if project_response.status_code != 200:
                    print(f"Failed to get GitLab project info: {project_response.text}")
                    return None
                default_branch = project_response.json()['default_branch']
                
                # Create new branch
                branch_data = {
                    "branch": branch_name,
                    "ref": default_branch
                }
                branch_url = f"{api_base}/projects/{project_path}/repository/branches"
                branch_response = requests.post(branch_url, headers=headers, json=branch_data)
                if branch_response.status_code not in [200, 201]:
                    print(f"Failed to create GitLab branch: {branch_response.text}")
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
                encoded_file_path = file_path.replace('/', '%2F')
                existing_file_url = f"{api_base}/projects/{project_path}/repository/files/{encoded_file_path}"
                existing_response = requests.get(existing_file_url, headers=headers, params={"ref": default_branch})
                
                file_data = {
                    "branch": branch_name,
                    "commit_message": f"🚀 Update production prompt for {project_name}",
                    "content": base64.b64encode(file_content.encode()).decode()
                }
                
                if existing_response.status_code == 200:
                    # File exists, update it
                    file_response = requests.put(existing_file_url, headers=headers, json=file_data)
                    action = "Update"
                else:
                    # File doesn't exist, create it
                    file_response = requests.post(existing_file_url, headers=headers, json=file_data)
                    action = "Create"
                
                if file_response.status_code not in [200, 201]:
                    print(f"Failed to {action.lower()} GitLab file: {file_response.text}")
                    return None
                
                # Create merge request
                mr_data = {
                    "source_branch": branch_name,
                    "target_branch": default_branch,
                    "title": f"🚀 {action} production prompt for {project_name}",
                    "description": f"This MR {'updates' if existing_response.status_code == 200 else 'creates'} the production prompt for **{project_name}** with model **{provider_id}**.\n\n**Prompt Details:**\n- User Prompt: {prompt_data.user_prompt[:100]}{'...' if len(prompt_data.user_prompt) > 100 else ''}\n- System Prompt: {prompt_data.system_prompt[:100] + '...' if prompt_data.system_prompt and len(prompt_data.system_prompt) > 100 else prompt_data.system_prompt or 'None'}\n- Temperature: {prompt_data.temperature}\n- Max Length: {prompt_data.max_len}\n\n**File:** `{file_path}`"
                }
                mr_url = f"{api_base}/projects/{project_path}/merge_requests"
                mr_response = requests.post(mr_url, headers=headers, json=mr_data)
                if mr_response.status_code not in [200, 201]:
                    print(f"Failed to create GitLab MR: {mr_response.text}")
                    return None
                
                mr_data = mr_response.json()
                return {
                    'pr_url': mr_data['web_url'],
                    'pr_number': mr_data['iid']  # GitLab uses 'iid' (internal ID)
                }
            
            elif platform == 'gitea':
                # Gitea implementation for prompt PR
                # Create branch name  
                import time
                timestamp = str(int(time.time()))
                branch_name = f"update-prompt-{project_name.lower().replace(' ', '-')}-{timestamp}"
                
                # Get default branch
                repo_info_url = f"{api_base}/repos/{owner}/{repo}"
                repo_response = requests.get(repo_info_url, headers=headers)
                if repo_response.status_code != 200:
                    print(f"Failed to get Gitea repo info: {repo_response.text}")
                    return None
                default_branch = repo_response.json()['default_branch']
                
                # Create new branch
                branch_data = {
                    "new_branch_name": branch_name,
                    "old_branch_name": default_branch
                }
                branch_url = f"{api_base}/repos/{owner}/{repo}/branches"
                branch_response = requests.post(branch_url, headers=headers, json=branch_data)
                if branch_response.status_code not in [200, 201]:
                    error_msg = branch_response.text
                    print(f"Failed to create Gitea branch: {error_msg}")
                    # Check for empty repository error
                    if "Git Repository is empty" in error_msg:
                        raise Exception("EMPTY_REPOSITORY: The git repository is empty. Please create an initial commit (e.g., add a README.md file) before creating pull requests.")
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
                    "branch": branch_name,
                    "message": f"🚀 Update production prompt for {project_name}",
                    "content": base64.b64encode(file_content.encode()).decode()
                }
                
                if existing_response.status_code == 200:
                    # File exists, update it
                    file_data["sha"] = existing_response.json()["sha"]
                    file_response = requests.put(existing_file_url, headers=headers, json=file_data)
                    action = "Update"
                else:
                    # File doesn't exist, create it
                    file_response = requests.post(existing_file_url, headers=headers, json=file_data)
                    action = "Create"
                
                if file_response.status_code not in [200, 201]:
                    print(f"Failed to {action.lower()} Gitea file: {file_response.text}")
                    return None
                
                # Create pull request
                pr_data = {
                    "head": branch_name,
                    "base": default_branch,
                    "title": f"🚀 {action} production prompt for {project_name}",
                    "body": f"This PR {'updates' if existing_response.status_code == 200 else 'creates'} the production prompt for **{project_name}** with model **{provider_id}**.\n\n**Prompt Details:**\n- User Prompt: {prompt_data.user_prompt[:100]}{'...' if len(prompt_data.user_prompt) > 100 else ''}\n- System Prompt: {prompt_data.system_prompt[:100] + '...' if prompt_data.system_prompt and len(prompt_data.system_prompt) > 100 else prompt_data.system_prompt or 'None'}\n- Temperature: {prompt_data.temperature}\n- Max Length: {prompt_data.max_len}\n\n**File:** `{file_path}`"
                }
                pr_url = f"{api_base}/repos/{owner}/{repo}/pulls"
                pr_response = requests.post(pr_url, headers=headers, json=pr_data)
                if pr_response.status_code not in [200, 201]:
                    print(f"Failed to create Gitea PR: {pr_response.text}")
                    return None
                
                pr_data = pr_response.json()
                return {
                    'pr_url': pr_data['html_url'],
                    'pr_number': pr_data['number']
                }
            
            else:
                print(f"Unsupported platform for prompt PR creation: {platform}")
                return None
                
        except Exception as e:
            print(f"Failed to create prompt PR: {e}")
            return None
    
    def get_prod_prompt_from_git(self, platform: str, token: str, repo_url: str, project_name: str, provider_id: str) -> Optional[ProdPromptData]:
        """Get the current production prompt from git repository"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, None, repo_url)
            headers = self.get_auth_headers(platform, token)
            
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
            
            elif platform == 'gitlab':
                # GitLab implementation
                project_path = f"{owner}%2F{repo}"
                encoded_file_path = file_path.replace('/', '%2F')
                file_url = f"{api_base}/projects/{project_path}/repository/files/{encoded_file_path}"
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
            
            elif platform == 'gitea':
                # Gitea implementation
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
                print(f"Unsupported platform: {platform}")
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
            
            headers = self.get_auth_headers(platform, token)
            
            print(f"🔍 Getting commit history for {platform}")
            print(f"   Repo URL: {repo_url}")
            print(f"   Owner: {owner}, Repo: {repo}")
            print(f"   API Base: {api_base}")
            print(f"   File Path: {file_path}")
            print(f"   Headers: {headers}")
            print(f"   Limit: {limit}")
            
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
            elif platform == 'gitlab':
                commits_url = f"{api_base}/projects/{owner}%2F{repo}/repository/commits"
                params = {
                    'path': file_path,
                    'per_page': limit
                }
                response = requests.get(commits_url, headers=headers, params=params)
                
                if response.status_code == 200:
                    commits = response.json()
                    return [
                        {
                            'sha': commit['id'],
                            'message': commit['message'],
                            'date': commit['created_at'],
                            'author': commit['author_name'],
                            'url': commit['web_url']
                        }
                        for commit in commits
                    ]
                else:
                    print(f"Failed to get GitLab commit history: {response.text}")
                    return []
                    
            elif platform == 'gitea':
                commits_url = f"{api_base}/repos/{owner}/{repo}/commits"
                params = {
                    'path': file_path,
                    'limit': limit
                }
                print(f"🔍 Gitea commits URL: {commits_url}")
                print(f"🔍 Gitea params: {params}")
                
                response = requests.get(commits_url, headers=headers, params=params)
                print(f"🔍 Gitea response status: {response.status_code}")
                print(f"🔍 Gitea response headers: {dict(response.headers)}")
                
                if response.status_code == 200:
                    commits = response.json()
                    print(f"🔍 Gitea commits count: {len(commits)}")
                    print(f"🔍 Gitea raw response: {response.text[:500]}...")
                    
                    parsed_commits = []
                    for i, commit in enumerate(commits):
                        print(f"🔍 Gitea commit {i}: {commit}")
                        parsed_commit = {
                            'sha': commit['sha'],
                            'message': commit['commit']['message'],
                            'date': commit['commit']['author']['date'],
                            'author': commit['commit']['author']['name'],
                            'url': commit['html_url']
                        }
                        print(f"🔍 Parsed commit {i}: {parsed_commit}")
                        parsed_commits.append(parsed_commit)
                    
                    return parsed_commits
                else:
                    print(f"❌ Failed to get Gitea commit history: {response.status_code}")
                    print(f"❌ Response text: {response.text}")
                    return []
            else:
                print(f"Unsupported platform: {platform}")
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
            
            headers = self.get_auth_headers(platform, token)
            
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
            elif platform == 'gitlab':
                file_url = f"{api_base}/projects/{owner}%2F{repo}/repository/files/{file_path.replace('/', '%2F')}"
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
                    print(f"Failed to get GitLab file content at commit: {response.text}")
                    return None
                    
            elif platform == 'gitea':
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
                    print(f"Failed to get Gitea file content at commit: {response.text}")
                    return None
            else:
                print(f"Unsupported platform: {platform}")
                return None
                
        except Exception as e:
            print(f"Failed to get file content at commit: {e}")
            return None
    
    def get_test_settings_from_git(self, platform: str, token: str, repo_url: str, project_name: str) -> Optional[Dict]:
        """Get test settings from git repository"""
        try:
            _, owner, repo = self.parse_git_url(repo_url)
            api_base = self.get_api_base_url(platform, repo_url)
            
            headers = self.get_auth_headers(platform, token)
            
            file_path = f"{project_name}_test.json"
            
            if platform == 'github':
                file_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                response = requests.get(file_url, headers=headers)
                
                if response.status_code == 200:
                    file_data = response.json()
                    content = base64.b64decode(file_data['content']).decode()
                    return json.loads(content)
                else:
                    print(f"Test settings file not found: {response.status_code}")
                    return None
                    
            elif platform == 'gitlab':
                file_url = f"{api_base}/projects/{owner}%2F{repo}/repository/files/{file_path.replace('/', '%2F')}"
                response = requests.get(file_url, headers=headers)
                
                if response.status_code == 200:
                    file_data = response.json()
                    content = base64.b64decode(file_data['content']).decode()
                    return json.loads(content)
                else:
                    print(f"Test settings file not found: {response.status_code}")
                    return None
                    
            elif platform == 'gitea':
                file_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                response = requests.get(file_url, headers=headers)
                
                if response.status_code == 200:
                    file_data = response.json()
                    content = base64.b64decode(file_data['content']).decode()
                    return json.loads(content)
                else:
                    print(f"Test settings file not found: {response.status_code}")
                    return None
            else:
                print(f"Unsupported platform: {platform}")
                return None
                
        except Exception as e:
            print(f"Failed to get test settings from git: {e}")
            return None
    
    def save_test_settings_to_git(self, platform: str, token: str, repo_url: str, project_name: str, settings: Dict) -> Dict:
        """Save test settings to git repository"""
        try:
            print(f"🔍 Starting save_test_settings_to_git:")
            print(f"🔍 Platform: {platform}")
            print(f"🔍 Repo URL: {repo_url}")
            print(f"🔍 Project name: {project_name}")
            print(f"🔍 Settings: {settings}")
            
            _, owner, repo = self.parse_git_url(repo_url)
            print(f"🔍 Parsed URL - Owner: {owner}, Repo: {repo}")
            
            api_base = self.get_api_base_url(platform, repo_url)
            print(f"🔍 API Base: {api_base}")
            
            headers = self.get_auth_headers(platform, token)
            print(f"🔍 Headers: {headers}")
            
            file_path = f"{project_name}_test.json"
            file_content = json.dumps(settings, indent=2)
            encoded_content = base64.b64encode(file_content.encode()).decode()
            print(f"🔍 File path: {file_path}")
            print(f"🔍 File content length: {len(file_content)}")
            print(f"🔍 File content: {file_content}")
            print(f"🔍 Encoded content length: {len(encoded_content)}")
            
            # Check if file exists to get sha (for updates)
            existing_sha = None
            if platform == 'github':
                check_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                check_response = requests.get(check_url, headers=headers)
                if check_response.status_code == 200:
                    existing_sha = check_response.json()['sha']
                
                # Create or update file
                data = {
                    "message": f"Update test settings for {project_name}",
                    "content": encoded_content,
                    "branch": "main"
                }
                if existing_sha:
                    data["sha"] = existing_sha
                
                response = requests.put(check_url, headers=headers, json=data)
                
                if response.status_code in [200, 201]:
                    result = response.json()
                    return {
                        "commit_sha": result['commit']['sha'],
                        "commit_url": result['commit']['html_url']
                    }
                else:
                    raise Exception(f"Failed to save file: {response.text}")
                    
            elif platform == 'gitlab':
                check_url = f"{api_base}/projects/{owner}%2F{repo}/repository/files/{file_path.replace('/', '%2F')}"
                check_response = requests.get(check_url, headers=headers)
                
                data = {
                    "branch": "main",
                    "content": file_content,
                    "commit_message": f"Update test settings for {project_name}"
                }
                
                if check_response.status_code == 200:
                    # File exists, update it
                    response = requests.put(check_url, headers=headers, json=data)
                else:
                    # File doesn't exist, create it
                    response = requests.post(check_url, headers=headers, json=data)
                
                if response.status_code in [200, 201]:
                    result = response.json()
                    return {
                        "commit_sha": result.get('id', 'unknown'),
                        "commit_url": f"{repo_url}/-/commit/{result.get('id', 'unknown')}"
                    }
                else:
                    raise Exception(f"Failed to save file: {response.text}")
                    
            elif platform == 'gitea':
                print(f"🔍 Gitea: Starting Gitea implementation")
                
                # For Gitea, we need to commit directly to main branch
                # Get the main branch SHA first
                repo_info_url = f"{api_base}/repos/{owner}/{repo}"
                print(f"🔍 Gitea: Getting repo info from: {repo_info_url}")
                repo_response = requests.get(repo_info_url, headers=headers)
                print(f"🔍 Gitea: Repo info response: {repo_response.status_code}")
                print(f"🔍 Gitea: Repo info response text: {repo_response.text}")
                
                if repo_response.status_code != 200:
                    print(f"❌ Failed to get Gitea repo info: {repo_response.text}")
                    raise Exception(f"Failed to get repository info: {repo_response.text}")
                
                repo_data = repo_response.json()
                default_branch = repo_data['default_branch']
                print(f"🔍 Gitea: Using default branch: {default_branch}")
                print(f"🔍 Gitea: Full repo data: {repo_data}")
                
                # Check if file exists on the default branch
                file_url = f"{api_base}/repos/{owner}/{repo}/contents/{file_path}"
                print(f"🔍 Gitea: Checking file existence at: {file_url}")
                existing_response = requests.get(file_url, headers=headers, params={'ref': default_branch})
                print(f"🔍 Gitea: File check response: {existing_response.status_code}")
                print(f"🔍 Gitea: File check response text: {existing_response.text}")
                
                file_data = {
                    "branch": default_branch,
                    "message": f"Update test settings for {project_name}",
                    "content": encoded_content
                }
                
                if existing_response.status_code == 200:
                    # File exists, update it
                    existing_data = existing_response.json()
                    file_data["sha"] = existing_data["sha"]
                    print(f"🔍 Gitea: File exists, updating with SHA: {existing_data['sha']}")
                    print(f"🔍 Gitea: Update data: {file_data}")
                    file_response = requests.put(file_url, headers=headers, json=file_data)
                    action = "Update"
                else:
                    # File doesn't exist, create it
                    print(f"🔍 Gitea: File doesn't exist, creating new file")
                    print(f"🔍 Gitea: Create data: {file_data}")
                    file_response = requests.post(file_url, headers=headers, json=file_data)
                    action = "Create"
                
                print(f"🔍 Gitea: {action} response: {file_response.status_code}")
                print(f"🔍 Gitea: {action} response headers: {file_response.headers}")
                print(f"🔍 Gitea: {action} response text: {file_response.text}")
                
                if file_response.status_code in [200, 201]:
                    result = file_response.json()
                    print(f"🔍 Gitea: Success! Result: {result}")
                    return {
                        "commit_sha": result['commit']['sha'],
                        "commit_url": result['commit']['html_url']
                    }
                else:
                    print(f"❌ Gitea: Failed to {action.lower()} file")
                    raise Exception(f"Failed to {action.lower()} file: {file_response.text}")
            else:
                raise Exception(f"Unsupported platform: {platform}")
                
        except Exception as e:
            print(f"Failed to save test settings to git: {e}")
            raise e