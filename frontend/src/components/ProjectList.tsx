import React from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  Button,
  Gallery,
  GalleryItem,
  Title,
  Label,
  Flex,
  FlexItem,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
} from '@patternfly/react-core';
import { ShareIcon, EllipsisVIcon, UserIcon, UsersIcon } from '@patternfly/react-icons';
import { Project, AppUser } from '../types';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onCreateNew: () => void;
  currentUser?: AppUser | null;
  onShareProject?: (project: Project) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onSelectProject,
  onCreateNew,
  currentUser,
  onShareProject,
}) => {
  const [openDropdown, setOpenDropdown] = React.useState<number | null>(null);
  if (projects.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <Title headingLevel="h2" size="lg">No projects found</Title>
        <p style={{ marginBottom: '2rem' }}>
          {currentUser 
            ? 'Create your first project to get started with prompt experimentation.'
            : 'Sign in to create and manage your projects.'}
        </p>
        {currentUser ? (
          <Button variant="primary" onClick={onCreateNew}>
            Create New Project
          </Button>
        ) : (
          <p style={{ color: 'var(--pf-global--info-color--100)' }}>
            Please sign in to create projects.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <Title headingLevel="h1" size="2xl">Projects</Title>
        {currentUser && (
          <Button variant="primary" onClick={onCreateNew}>
            Create New Project
          </Button>
        )}
      </div>
      <Gallery hasGutter>
        {projects.map((project) => {
          const isOwner = currentUser && project.owner?.id === currentUser.id;
          const collaboratorCount = project.collaborators?.length || 0;
          const hasCollaborators = collaboratorCount > 0;
          
          return (
            <GalleryItem key={project.id}>
              <Card isClickable onClick={() => onSelectProject(project)}>
                <CardTitle>
                  <Flex alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>{project.name}</FlexItem>
                    <FlexItem>
                      {hasCollaborators && (
                        <Label color="blue" icon={<UsersIcon />}>
                          {collaboratorCount + 1} member{collaboratorCount > 0 ? 's' : ''}
                        </Label>
                      )}
                    </FlexItem>
                    {currentUser && onShareProject && (
                      <FlexItem>
                        <Dropdown
                          isOpen={openDropdown === project.id}
                          onSelect={() => setOpenDropdown(null)}
                          onOpenChange={(isOpen: boolean) => setOpenDropdown(isOpen ? project.id : null)}
                          toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                            <MenuToggle
                              ref={toggleRef}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenDropdown(openDropdown === project.id ? null : project.id);
                              }}
                              isExpanded={openDropdown === project.id}
                              variant="plain"
                            >
                              <EllipsisVIcon />
                            </MenuToggle>
                          )}
                        >
                          <DropdownList>
                            <DropdownItem 
                              key="share" 
                              icon={<ShareIcon />}
                              onClick={(e) => {
                                e.stopPropagation();
                                onShareProject(project);
                              }}
                            >
                              Manage Sharing
                            </DropdownItem>
                          </DropdownList>
                        </Dropdown>
                      </FlexItem>
                    )}
                  </Flex>
                </CardTitle>
                <CardBody>
                  {project.owner && (
                    <>
                      <small style={{ color: 'var(--pf-global--Color--200)' }}>
                        <UserIcon style={{ marginRight: '4px' }} />
                        Owner: {project.owner.name}
                      </small>
                      <br />
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
                  <Flex style={{ marginTop: '1rem' }}>
                    <FlexItem>
                      <Button variant="secondary" onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(project);
                      }}>
                        Open
                      </Button>
                    </FlexItem>
                    {isOwner && (
                      <FlexItem>
                        <Label color="green" icon={<UserIcon />}>
                          Owner
                        </Label>
                      </FlexItem>
                    )}
                  </Flex>
                </CardBody>
              </Card>
            </GalleryItem>
          );
        })}
      </Gallery>
    </div>
  );
};