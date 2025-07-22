import React, { useState, useEffect } from 'react';
import {
  Button,
  Title,
} from '@patternfly/react-core';
import { Project, GitUser } from '../../types';
import { api } from '../../api';
import { LeftNavigation, NavigationPage } from '../../components/shared';
import { ProjectEditModal, DeleteProjectModal, ApiDocumentationModal } from '../../components/modals';
import { PlaygroundPage } from './PlaygroundPage';

interface PromptExperimentViewProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate?: (updatedProject: Project) => void;
  onProjectDelete?: () => void;
  onProjectSelect?: (project: Project) => void;
  allProjects?: Project[];
  onCreateNew?: () => void;
  gitUser?: GitUser | null;
  onGitAuth?: () => void;
  onNotification?: (notification: {
    title: string;
    variant: 'success' | 'danger' | 'warning' | 'info';
    message?: string;
    actionLinks?: Array<{ text: string; url: string }>;
    actionButton?: { text: string; onClick: () => void };
  }) => void;
}

export const PromptExperimentView: React.FC<PromptExperimentViewProps> = ({
  project,
  onBack,
  onProjectUpdate,
  onProjectDelete,
  onProjectSelect,
  allProjects = [],
  onCreateNew,
  gitUser,
  onGitAuth,
  onNotification,
}) => {
  const [currentProject, setCurrentProject] = useState<Project>(project);
  const [currentPage, setCurrentPage] = useState<NavigationPage>('playground');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isApiDocModalOpen, setIsApiDocModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setCurrentProject(project);
  }, [project]);

  const handleEditProject = async (data: { name: string; llamastackUrl: string; providerId: string }) => {
    try {
      const updatedProject = await api.updateProject(currentProject.id, data);
      setCurrentProject(updatedProject);
      if (onProjectUpdate) {
        onProjectUpdate(updatedProject);
      }
    } catch (err) {
      console.error('Project update error:', err);
      if (onNotification) {
        onNotification({
          title: 'Error',
          variant: 'danger',
          message: 'Failed to update project'
        });
      }
    }
  };

  const handleDeleteProject = async () => {
    setIsDeleting(true);
    try {
      await api.deleteProject(currentProject.id);
      setIsDeleteModalOpen(false);
      if (onProjectDelete) {
        onProjectDelete();
      } else {
        onBack();
      }
    } catch (err) {
      console.error('Project deletion error:', err);
      if (onNotification) {
        onNotification({
          title: 'Error',
          variant: 'danger',
          message: 'Failed to delete project'
        });
      }
      setIsDeleting(false);
    }
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'playground':
        return (
          <PlaygroundPage
            project={currentProject}
            onNotification={onNotification}
          />
        );
      default:
        return (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100%',
            color: '#666'
          }}>
            <div style={{ textAlign: 'center' }}>
              <Title headingLevel="h3" size="lg">
                Coming Soon
              </Title>
              <p>This page is under development.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div style={{ 
      width: '100vw', 
      minHeight: '100vh', 
      margin: 0, 
      padding: 0,
      backgroundColor: '#f0f0f0',
      display: 'flex'
    }}>
      {/* Left Navigation */}
      <LeftNavigation
        activePage={currentPage}
        onPageChange={setCurrentPage}
        projectName={currentProject.name}
      />

      {/* Main Content Area */}
      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh'
      }}>
        {/* Header Section */}
        <div style={{ 
          padding: '1rem',
          backgroundColor: 'white',
          borderBottom: '1px solid #d2d2d2',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <Title headingLevel="h1" size="xl" style={{ marginBottom: '0.25rem' }}>
              {currentProject.name}
            </Title>
            <div style={{ color: '#666', fontSize: '0.875rem' }}>
              Model: {currentProject.provider_id} | URL: {currentProject.llamastack_url}
            </div>
          </div>
          
          {/* Project Management Controls */}
          <div style={{ 
            display: 'flex',
            gap: 'var(--pf-global--spacer--sm)'
          }}>
            <Button variant="secondary" size="sm" onClick={() => setIsEditModalOpen(true)}>
              Edit Project
            </Button>
            <Button variant="danger" size="sm" onClick={() => setIsDeleteModalOpen(true)}>
              Delete
            </Button>
            <Button variant="tertiary" size="sm" onClick={() => setIsApiDocModalOpen(true)}>
              API Docs
            </Button>
            <Button variant="link" size="sm" onClick={onBack}>
              ← Back to Projects
            </Button>
          </div>
        </div>

        {/* Page Content */}
        <div style={{ 
          flex: 1,
          padding: '1rem',
          backgroundColor: '#f5f5f5',
          minHeight: 0
        }}>
          {renderCurrentPage()}
        </div>
      </div>

      {/* Modals */}
      <ProjectEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleEditProject}
        project={currentProject}
      />

      <DeleteProjectModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteProject}
        project={currentProject}
        isDeleting={isDeleting}
      />

      <ApiDocumentationModal
        isOpen={isApiDocModalOpen}
        onClose={() => setIsApiDocModalOpen(false)}
      />
    </div>
  );
};