import React, { useState, useEffect } from 'react';
import {
  Page,
  PageSection,
  Title,
  Spinner,
  Alert,
} from '@patternfly/react-core';
import { Project } from './types';
import { api } from './api';
import { ProjectList } from './components/ProjectList';
import { ProjectModal } from './components/ProjectModal';
import { PromptExperimentView } from './components/PromptExperimentView';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const projectsData = await api.getProjects();
      setProjects(projectsData);
      // Auto-select first project if none is selected and projects exist
      if (!selectedProject && projectsData.length > 0) {
        setSelectedProject(projectsData[0]);
      }
    } catch (err) {
      setError('Failed to load projects. Make sure the backend server is running.');
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (data: {
    name: string;
    llamastackUrl: string;
    providerId: string;
  }) => {
    try {
      const newProject = await api.createProject(data);
      setProjects([newProject, ...projects]);
      setSelectedProject(newProject);
    } catch (err) {
      setError('Failed to create project');
      console.error('Failed to create project:', err);
    }
  };

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
    loadProjects(); // Refresh projects list
  };

  const handleProjectUpdate = (updatedProject: Project) => {
    setSelectedProject(updatedProject);
    // Update the project in the projects list
    setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const handleProjectDelete = () => {
    // After deletion, select another project or show project list
    setSelectedProject(null);
    loadProjects();
  };

  if (isLoading) {
    return (
      <Page>
        <PageSection style={{ textAlign: 'center', padding: '4rem' }}>
          <Spinner size="xl" />
          <p style={{ marginTop: '1rem' }}>
            Loading projects...
          </p>
        </PageSection>
      </Page>
    );
  }

  // Render the ProjectModal so it's always available
  const modal = (
    <ProjectModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      onSubmit={handleCreateProject}
    />
  );

  // Show experiment view if there's a selected project
  if (selectedProject && projects.length > 0) {
    return (
      <>
        <PromptExperimentView
          project={selectedProject}
          onBack={handleBackToProjects}
          onProjectUpdate={handleProjectUpdate}
          onProjectDelete={handleProjectDelete}
          onProjectSelect={handleSelectProject}
          allProjects={projects}
          onCreateNew={() => setIsModalOpen(true)}
        />
        {modal}
      </>
    );
  }

  // Show project creation/list page only if no projects exist
  return (
    <>
      <Page>
        <PageSection>
          <Title headingLevel="h1" size="2xl">Prompt Experimentation Tool</Title>
          <p>
            Experiment with prompts using different Llama Stack models and track your results.
          </p>
          
          {error && (
            <Alert variant="danger" title="Error" style={{ marginTop: '1rem' }}>
              {error}
            </Alert>
          )}
          
          <ProjectList
            projects={projects}
            onSelectProject={handleSelectProject}
            onCreateNew={() => setIsModalOpen(true)}
          />
        </PageSection>
      </Page>
      {modal}
    </>
  );
}

export default App;
