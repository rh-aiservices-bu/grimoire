import React, { useState, useEffect } from 'react';
import {
  Page,
  PageSection,
  Title,
  Spinner,
  Alert,
  AlertGroup,
  AlertActionCloseButton,
  Button,
} from '@patternfly/react-core';
import { Project, GitUser } from './types';
import { api } from './api';
import { ProjectList } from './components/ProjectList';
import { ProjectModal } from './components/ProjectModal';
import { PromptExperimentView } from './components/PromptExperimentView';
import { GitAuthModal } from './components/GitAuthModal';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [gitUser, setGitUser] = useState<GitUser | null>(null);
  const [isGitAuthModalOpen, setIsGitAuthModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    variant: 'success' | 'danger' | 'warning' | 'info';
    message?: string;
    actionLinks?: Array<{ text: string; url: string }>;
    actionButton?: { text: string; onClick: () => void };
  }>>([]);

  useEffect(() => {
    loadProjects();
    loadGitUser();
  }, []);

  const loadGitUser = async () => {
    try {
      const user = await api.getCurrentGitUser();
      setGitUser(user);
    } catch (error) {
      // No git user authenticated yet, that's fine
      setGitUser(null);
    }
  };

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
    gitRepoUrl?: string;
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

  const addNotification = (notification: Omit<typeof notifications[0], 'id'>) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { ...notification, id }]);
    // Auto-remove after 10 seconds unless it has action links or buttons
    if ((!notification.actionLinks || notification.actionLinks.length === 0) && !notification.actionButton) {
      setTimeout(() => removeNotification(id), 10000);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleGitAuth = async (data: { platform: string; username: string; access_token: string }) => {
    try {
      const user = await api.authenticateGit(data);
      setGitUser(user);
      setError(''); // Clear any previous errors
      addNotification({
        title: 'Git Authentication Successful',
        variant: 'success',
        message: `Successfully authenticated as ${user.git_username} on ${user.git_platform}`
      });
      // Close the git auth modal
      setIsGitAuthModalOpen(false);
    } catch (error) {
      addNotification({
        title: 'Git Authentication Failed',
        variant: 'danger',
        message: 'Please check your credentials and ensure your access token has repository permissions.'
      });
      console.error('Git authentication failed:', error);
    }
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

  // Render the modals so they're always available
  const modals = (
    <>
      <ProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateProject}
      />
      <GitAuthModal
        isOpen={isGitAuthModalOpen}
        onClose={() => setIsGitAuthModalOpen(false)}
        onSubmit={handleGitAuth}
      />
    </>
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
          gitUser={gitUser}
          onGitAuth={() => setIsGitAuthModalOpen(true)}
          onNotification={addNotification}
        />
        <AlertGroup isToast isLiveRegion>
          {notifications.map(notification => (
            <Alert
              key={notification.id}
              variant={notification.variant}
              title={notification.title}
              actionClose={<AlertActionCloseButton onClose={() => removeNotification(notification.id)} />}
              actionLinks={[
                ...(notification.actionLinks?.map(link => (
                  <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.text}
                  </a>
                )) || []),
                ...(notification.actionButton ? [
                  <Button
                    key="action"
                    variant="link"
                    onClick={() => {
                      notification.actionButton!.onClick();
                      removeNotification(notification.id);
                    }}
                  >
                    {notification.actionButton.text}
                  </Button>
                ] : [])
              ]}
            >
              {notification.message}
            </Alert>
          ))}
        </AlertGroup>
        {modals}
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
      {modals}
    </>
  );
}

export default App;
