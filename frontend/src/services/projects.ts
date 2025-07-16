import { api } from '../api';
import { Project } from '../types';

export const projectService = {
  async getAll(): Promise<Project[]> {
    return api.getProjects();
  },

  async create(data: {
    name: string;
    llamastackUrl: string;
    providerId: string;
    gitRepoUrl?: string;
  }): Promise<Project> {
    return api.createProject(data);
  },

  async update(id: number, data: Partial<Project>): Promise<Project> {
    return api.updateProject(id, data);
  },

  async delete(id: number): Promise<void> {
    return api.deleteProject(id);
  },

  async getById(id: number): Promise<Project> {
    const projects = await this.getAll();
    const project = projects.find(p => p.id === id);
    if (!project) {
      throw new Error(`Project with id ${id} not found`);
    }
    return project;
  },
};