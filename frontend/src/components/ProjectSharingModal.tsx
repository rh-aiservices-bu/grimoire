import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Form,
  FormGroup,
  TextInput,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Alert,
  AlertVariant,
  Select,
  SelectOption,
  DataList,
  DataListItem,
  DataListItemRow,
  DataListItemCells,
  DataListCell,
  Label,
  Flex,
  FlexItem,
  Spinner,
} from '@patternfly/react-core';
import { TrashIcon, UserIcon } from '@patternfly/react-icons';
import { api } from '../api';
import { Project, ProjectCollaborator, AppUser } from '../types';

interface ProjectSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  currentUser: AppUser;
  onProjectUpdated: () => void;
}

export const ProjectSharingModal: React.FC<ProjectSharingModalProps> = ({ 
  isOpen, 
  onClose, 
  project, 
  currentUser,
  onProjectUpdated 
}) => {
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Add collaborator form
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'viewer' | 'editor' | 'owner'>('viewer');
  const [roleSelectOpen, setRoleSelectOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCollaborators();
    }
  }, [isOpen, project.id]);

  const loadCollaborators = async () => {
    setLoading(true);
    try {
      const data = await api.getCollaborators(project.id);
      setCollaborators(data);
    } catch (err: any) {
      setError('Failed to load collaborators');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCollaborator = async () => {
    if (!newEmail.trim()) {
      setError('Please enter an email address');
      return;
    }

    setAdding(true);
    setError('');
    setSuccess('');

    try {
      await api.addCollaborator(project.id, {
        email: newEmail,
        role: newRole,
      });
      
      setSuccess(`Successfully added ${newEmail} as ${newRole}`);
      setNewEmail('');
      setNewRole('viewer');
      await loadCollaborators();
      onProjectUpdated();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add collaborator');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: number, email: string) => {
    if (!confirm(`Remove ${email} from this project?`)) {
      return;
    }

    try {
      await api.removeCollaborator(project.id, collaboratorId);
      setSuccess(`Removed ${email} from project`);
      await loadCollaborators();
      onProjectUpdated();
    } catch (err: any) {
      setError('Failed to remove collaborator');
    }
  };

  const handleRoleChange = async (collaboratorId: number, newRole: string, email: string) => {
    try {
      await api.updateCollaboratorRole(project.id, collaboratorId, newRole);
      setSuccess(`Updated ${email}'s role to ${newRole}`);
      await loadCollaborators();
      onProjectUpdated();
    } catch (err: any) {
      setError('Failed to update role');
    }
  };

  const isOwner = project.owner?.id === currentUser.id;
  const canEdit = isOwner || collaborators.some(c => c.user.id === currentUser.id && c.role === 'editor');

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'blue';
      case 'editor': return 'green';
      case 'viewer': return 'grey';
      default: return 'grey';
    }
  };

  return (
    <Modal
      variant={ModalVariant.large}
      title={`Share Project: ${project.name}`}
      isOpen={isOpen}
      onClose={onClose}
    >
      <ModalHeader />
      <ModalBody>
        {error && (
          <Alert variant={AlertVariant.danger} title="Error" style={{ marginBottom: '1rem' }}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert variant={AlertVariant.success} title="Success" style={{ marginBottom: '1rem' }}>
            {success}
          </Alert>
        )}

        {(isOwner || canEdit) && (
          <Form style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--pf-global--BorderColor--100)', borderRadius: '4px' }}>
            <h3 style={{ marginBottom: '1rem' }}>
              Add Collaborator
            </h3>
            <Flex>
              <FlexItem flex={{ default: 'flex_2' }}>
                <FormGroup label="Email" fieldId="collaborator-email">
                  <TextInput
                    type="email"
                    id="collaborator-email"
                    value={newEmail}
                    onChange={(_event, value) => setNewEmail(value)}
                    placeholder="colleague@example.com"
                  />
                </FormGroup>
              </FlexItem>
              <FlexItem flex={{ default: 'flex_1' }}>
                <FormGroup label="Role" fieldId="collaborator-role">
                  <Select
                    onToggle={setRoleSelectOpen}
                    onSelect={(_, selection) => {
                      setNewRole(selection as 'viewer' | 'editor' | 'owner');
                      setRoleSelectOpen(false);
                    }}
                    selections={newRole}
                    isOpen={roleSelectOpen}
                    placeholderText="Select role"
                  >
                    <SelectOption value="viewer">Viewer</SelectOption>
                    <SelectOption value="editor">Editor</SelectOption>
                    {isOwner && <SelectOption value="owner">Owner</SelectOption>}
                  </Select>
                </FormGroup>
              </FlexItem>
              <FlexItem alignSelf={{ default: 'alignSelfFlexEnd' }}>
                <Button 
                  variant="primary" 
                  onClick={handleAddCollaborator}
                  isLoading={adding}
                  style={{ marginBottom: '1rem' }}
                >
                  Add
                </Button>
              </FlexItem>
            </Flex>
          </Form>
        )}

        <h3 style={{ marginBottom: '1rem' }}>
          Current Access
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Spinner size="lg" />
          </div>
        ) : (
          <DataList aria-label="Project collaborators">
            {/* Show owner first */}
            {project.owner && (
              <DataListItem aria-labelledby="owner-item">
                <DataListItemRow>
                  <DataListItemCells
                    dataListCells={[
                      <DataListCell key="user-info">
                        <Flex alignItems={{ default: 'alignItemsCenter' }}>
                          <FlexItem>
                            <UserIcon style={{ marginRight: '8px', color: 'var(--pf-global--primary-color--100)' }} />
                          </FlexItem>
                          <FlexItem>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                {project.owner.name}
                              </div>
                              <br />
                              <div style={{ color: 'var(--pf-global--Color--200)', fontSize: '14px' }}>
                                {project.owner.email}
                              </div>
                            </div>
                          </FlexItem>
                        </Flex>
                      </DataListCell>,
                      <DataListCell key="role">
                        <Label color={getRoleColor('owner')}>Owner</Label>
                      </DataListCell>,
                      <DataListCell key="actions">
                        {/* Owner cannot be removed */}
                      </DataListCell>
                    ]}
                  />
                </DataListItemRow>
              </DataListItem>
            )}

            {/* Show collaborators */}
            {collaborators.map((collaborator) => (
              <DataListItem key={collaborator.id} aria-labelledby={`collaborator-${collaborator.id}`}>
                <DataListItemRow>
                  <DataListItemCells
                    dataListCells={[
                      <DataListCell key="user-info">
                        <Flex alignItems={{ default: 'alignItemsCenter' }}>
                          <FlexItem>
                            <UserIcon style={{ marginRight: '8px', color: 'var(--pf-global--primary-color--100)' }} />
                          </FlexItem>
                          <FlexItem>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                {collaborator.user.name}
                              </div>
                              <br />
                              <div style={{ color: 'var(--pf-global--Color--200)', fontSize: '14px' }}>
                                {collaborator.user.email}
                              </div>
                            </div>
                          </FlexItem>
                        </Flex>
                      </DataListCell>,
                      <DataListCell key="role">
                        <Label color={getRoleColor(collaborator.role)}>{collaborator.role}</Label>
                      </DataListCell>,
                      <DataListCell key="actions">
                        {(isOwner || (canEdit && collaborator.role === 'viewer')) && (
                          <Button
                            variant="link"
                            icon={<TrashIcon />}
                            onClick={() => handleRemoveCollaborator(collaborator.id, collaborator.user.email)}
                            isDanger
                          >
                            Remove
                          </Button>
                        )}
                      </DataListCell>
                    ]}
                  />
                </DataListItemRow>
              </DataListItem>
            ))}

            {collaborators.length === 0 && !project.owner && (
              <DataListItem>
                <DataListItemRow>
                  <DataListItemCells
                    dataListCells={[
                      <DataListCell key="empty">
                        <div style={{ color: 'var(--pf-global--Color--200)', textAlign: 'center', padding: '2rem', fontSize: '14px' }}>
                          No collaborators yet. Add team members to start collaborating!
                        </div>
                      </DataListCell>
                    ]}
                  />
                </DataListItemRow>
              </DataListItem>
            )}
          </DataList>
        )}
      </ModalBody>
      <ModalFooter>
        <Button key="close" variant="primary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};