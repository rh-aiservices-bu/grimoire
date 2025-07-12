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
  Masthead,
  MastheadToggle,
  MastheadMain,
  MastheadBrand,
  MastheadContent,
  Brand,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { Project, GitUser, UserSession } from './types';
import { api } from './api';
import { ProjectList } from './components/ProjectList';
import { ProjectModal } from './components/ProjectModal';
import { PromptExperimentView } from './components/PromptExperimentView';
import { GitAuthModal } from './components/GitAuthModal';
import { AuthModal } from './components/AuthModal';
import { UserMenu } from './components/UserMenu';
import { ProjectSharingModal } from './components/ProjectSharingModal';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [gitUser, setGitUser] = useState<GitUser | null>(null);
  const [isGitAuthModalOpen, setIsGitAuthModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSharingModalOpen, setIsSharingModalOpen] = useState(false);
  const [sharingProject, setSharingProject] = useState<Project | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    variant: 'success' | 'danger' | 'warning' | 'info';
    message?: string;
    actionLinks?: Array<{ text: string; url: string }>;
    actionButton?: { text: string; onClick: () => void };
  }>>([]);

  useEffect(() => {
    if (!authLoading) {
      loadProjects();
      loadGitUser();
    }
  }, [authLoading]);

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

  const handleAuthenticated = (session: UserSession) => {
    login(session);
    addNotification({
      id: Date.now().toString(),
      title: 'Welcome!',
      variant: 'success',
      message: `Successfully logged in as ${session.user.name}`,
    });
    // Refresh projects to see user-specific data
    loadProjects();
  };

  const handleLogout = async () => {
    await logout();
    addNotification({
      id: Date.now().toString(),
      title: 'Logged out',
      variant: 'info',
      message: 'You have been successfully logged out',
    });
    // Refresh projects to see public data
    loadProjects();
  };

  const handleShareProject = (project: Project) => {
    setSharingProject(project);
    setIsSharingModalOpen(true);
  };

  const handleSharingModalClose = () => {
    setIsSharingModalOpen(false);
    setSharingProject(null);
  };

  const handleProjectUpdated = () => {
    // Refresh projects when sharing is updated
    loadProjects();
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
    setIsAuthenticating(true);
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
    } finally {
      setIsAuthenticating(false);
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

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <Brand alt="Prompt Experimentation Tool">
            Prompt Experimentation Tool
          </Brand>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar id="toolbar">
          <ToolbarContent>
            {user ? (
              <ToolbarItem>
                <UserMenu user={user} onLogout={handleLogout} />
              </ToolbarItem>
            ) : (
              <ToolbarItem>
                <Button variant="primary" onClick={() => setIsAuthModalOpen(true)}>
                  Sign In
                </Button>
              </ToolbarItem>
            )}
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );

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
        onClose={() => !isAuthenticating && setIsGitAuthModalOpen(false)}
        onSubmit={handleGitAuth}
        isAuthenticating={isAuthenticating}
      />
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />
      {sharingProject && user && (
        <ProjectSharingModal
          isOpen={isSharingModalOpen}
          onClose={handleSharingModalClose}
          project={sharingProject}
          currentUser={user}
          onProjectUpdated={handleProjectUpdated}
        />
      )}
    </>
  );

  // Show experiment view if there's a selected project
  if (selectedProject && projects.length > 0) {
    return (
      <>
        <Page masthead={masthead}>
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
        </Page>
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

  // Show loading spinner while authentication is loading
  if (authLoading) {
    return (
      <>
        <Page masthead={masthead}>
          <PageSection style={{ textAlign: 'center', padding: '4rem' }}>
            <Spinner size="xl" />
            <p style={{ marginTop: '1rem' }}>Loading...</p>
          </PageSection>
        </Page>
        {modals}
      </>
    );
  }

  // Show project creation/list page only if no projects exist
  return (
    <>
      <Page masthead={masthead}>
        <PageSection>
          <Title headingLevel="h1" size="2xl">Prompt Experimentation Tool</Title>
          <p>
            Experiment with prompts using different Llama Stack models and track your results.
            {!user && (
              <span style={{ color: 'var(--pf-global--info-color--100)', marginLeft: '1rem' }}>
                Sign in to create and share projects with your team.
              </span>
            )}
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
            currentUser={user}
            onShareProject={handleShareProject}
          />
        </PageSection>
      </Page>
      {modals}
    </>
  );
}

export default App;
