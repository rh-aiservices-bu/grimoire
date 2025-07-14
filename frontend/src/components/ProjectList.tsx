import React from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  Button,
  Gallery,
  GalleryItem,
  Title,
} from '@patternfly/react-core';
import { Project } from '../types';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onCreateNew: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onSelectProject,
  onCreateNew,
}) => {
  if (projects.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <Title headingLevel="h2" size="lg">No projects found</Title>
        <p style={{ marginBottom: '2rem' }}>
          Create your first project to get started with prompt experimentation.
        </p>
        <Button variant="primary" onClick={onCreateNew}>
          Create New Project
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <Title headingLevel="h1" size="2xl">Projects</Title>
        <Button variant="primary" onClick={onCreateNew}>
          Create New Project
        </Button>
      </div>
      <Gallery hasGutter>
        {projects.map((project) => (
          <GalleryItem key={project.id}>
            <Card isClickable onClick={() => onSelectProject(project)}>
              <CardTitle>{project.name}</CardTitle>
              <CardBody>
                {project.description && (
                  <>
                    <p style={{ marginBottom: '1rem', color: '#666' }}>
                      {project.description}
                    </p>
                  </>
                )}
                <small>
                  Provider: {project.provider_id}
                </small>
                <br />
                <small>
                  URL: {project.llamastack_url}
                </small>
                <br />
                <small>
                  Created: {new Date(project.created_at).toLocaleDateString()}
                </small>
                <br />
                <Button variant="secondary" onClick={(e) => {
                  e.stopPropagation();
                  onSelectProject(project);
                }} style={{ marginTop: '1rem' }}>
                  Open
                </Button>
              </CardBody>
            </Card>
          </GalleryItem>
        ))}
      </Gallery>
    </div>
  );
};