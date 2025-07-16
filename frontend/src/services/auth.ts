import { api } from '../api';
import { GitUser } from '../types';

export const authService = {
  async getCurrentGitUser(): Promise<GitUser | null> {
    try {
      return await api.getCurrentGitUser();
    } catch (error) {
      return null;
    }
  },

  async authenticateGit(data: {
    platform: string;
    username: string;
    access_token: string;
  }): Promise<GitUser> {
    return api.authenticateGit(data);
  },

  async testGitConnection(data: {
    platform: string;
    username: string;
    access_token: string;
    repo_url: string;
  }): Promise<boolean> {
    return api.testGitConnection(data);
  },
};