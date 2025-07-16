import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
import { ProjectList } from './pages/ProjectList';
import { PromptExperimentView } from './pages/PromptExperiment';
import { ProjectModal, GitAuthModal } from './components/modals';
import { AppProvider, useApp } from './context/AppContext';
import { Project } from './types';

function AppContent() {
  const navigate = useNavigate();
  const { state, actions } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGitAuthModalOpen, setIsGitAuthModalOpen] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleCreateProject = async (data: {
    name: string;
    llamastackUrl: string;
    providerId: string;
    gitRepoUrl?: string;
  }) => {
    await actions.createProject(data);
    navigate(`/project/${state.selectedProject?.id}`);
  };

  const handleSelectProject = (project: Project) => {
    actions.selectProject(project);
    navigate(`/project/${project.id}`);
  };

  const handleBackToProjects = () => {
    actions.selectProject(null);
    navigate('/');
    actions.loadProjects(); // Refresh projects list
  };

  const handleProjectUpdate = (updatedProject: Project) => {
    actions.updateProject(updatedProject);
  };

  const handleProjectDelete = () => {
    // After deletion, select another project or show project list
    actions.selectProject(null);
    actions.loadProjects();
  };

  const handleGitAuth = async (data: { platform: string; username: string; access_token: string }) => {
    setIsAuthenticating(true);
    try {
      await actions.authenticateGit(data);
      // Close the git auth modal
      setIsGitAuthModalOpen(false);
    } catch (error) {
      // Error handling is done in the context
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (state.isLoading) {
    return (
      <Page className="app-full-width">
        <PageSection className="loading-container">
          <Spinner size="xl" />
          <p>Loading projects...</p>
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
        onClose={() => !isAuthenticating && setIsGitAuthModalOpen(false)}
        onSubmit={handleGitAuth}
        isAuthenticating={isAuthenticating}
      />
    </>
  );

  return (
    <>
      <Routes>
        <Route 
          path="/" 
          element={
            <Page className="app-full-width">
              <PageSection>
                <div className="pf-u-mb-lg">
                  <Title headingLevel="h1" size="2xl">Prompt Experimentation Tool</Title>
                  <p className="pf-u-color-200">
                    Experiment with prompts using different Llama Stack models and track your results.
                  </p>
                </div>
                
                {state.error && (
                  <Alert variant="danger" title="Error" className="pf-u-mb-md">
                    {state.error}
                  </Alert>
                )}
                
                <ProjectList
                  projects={state.projects}
                  onSelectProject={handleSelectProject}
                  onCreateNew={() => setIsModalOpen(true)}
                />
              </PageSection>
            </Page>
          } 
        />
        <Route 
          path="/project/:id" 
          element={
            state.selectedProject ? (
              <PromptExperimentView
                project={state.selectedProject}
                onBack={handleBackToProjects}
                onProjectUpdate={handleProjectUpdate}
                onProjectDelete={handleProjectDelete}
                onProjectSelect={handleSelectProject}
                allProjects={state.projects}
                onCreateNew={() => setIsModalOpen(true)}
                gitUser={state.gitUser}
                onGitAuth={() => setIsGitAuthModalOpen(true)}
                onNotification={actions.addNotification}
              />
            ) : (
              <Navigate to="/" replace />
            )
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
      <AlertGroup isToast isLiveRegion>
        {state.notifications.map(notification => (
          <Alert
            key={notification.id}
            variant={notification.variant}
            title={notification.title}
            actionClose={<AlertActionCloseButton onClose={() => actions.removeNotification(notification.id)} />}
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
                    actions.removeNotification(notification.id);
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

function App() {
  return (
    <Router>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </Router>
  );
}

export default App;
